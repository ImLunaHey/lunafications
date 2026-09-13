use std::{env, sync::Arc};

use bluesky_jetstream::{ConnectionEvent, Jetstream, JetstreamConfig};
use lunafications_shadow::{HttpStateLookup, evaluate_event};
use tokio::{io::AsyncWriteExt, net::TcpListener, sync::RwLock};
use tracing::{error, info, warn};

const COLLECTIONS: [&str; 3] = [
    "app.bsky.graph.block",
    "app.bsky.graph.listitem",
    "app.bsky.feed.post",
];

#[derive(Default)]
struct Health {
    connected: bool,
    events: u64,
    decisions: u64,
    errors: u64,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    if let Err(error) = run().await {
        error!(%error, "shadow worker stopped");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let api_url = env::var("SHADOW_API_URL")?;
    let api_token = env::var("SHADOW_API_TOKEN")?;
    let state = HttpStateLookup::new(&api_url, api_token)?;
    state.refresh().await?;
    let health = Arc::new(RwLock::new(Health::default()));
    let port = env::var("PORT")
        .unwrap_or_else(|_| "3000".into())
        .parse::<u16>()?;
    tokio::spawn(serve_health(port, health.clone()));
    tokio::spawn(refresh_state(state.clone()));

    let config = JetstreamConfig {
        wanted_collections: COLLECTIONS.into_iter().map(str::to_owned).collect(),
        ..JetstreamConfig::default()
    };
    let mut connection = Jetstream::new(config).connect();
    info!(
        mode = "shadow",
        api_url, "shadow worker started; delivery capability is not compiled in"
    );

    while let Some(message) = connection.next().await {
        match message {
            ConnectionEvent::Open => {
                health.write().await.connected = true;
                info!("Jetstream connected");
            }
            ConnectionEvent::Close => {
                health.write().await.connected = false;
                warn!("Jetstream disconnected; reconnecting");
            }
            ConnectionEvent::Error(message) => {
                health.write().await.errors += 1;
                warn!(error = message, "Jetstream error");
            }
            ConnectionEvent::Event(event) => {
                health.write().await.events += 1;
                match evaluate_event(&event, &state).await {
                    Ok(decisions) => {
                        health.write().await.decisions += decisions.len() as u64;
                        for decision in decisions {
                            info!(
                                shadow = true,
                                key = decision.key,
                                recipient = decision.recipient,
                                notification_type = ?decision.notification_type,
                                actor = decision.actor,
                                "shadow notification decision"
                            );
                        }
                    }
                    Err(error) => {
                        health.write().await.errors += 1;
                        error!(%error, cursor = event.time_us(), "failed to evaluate shadow event");
                    }
                }
            }
        }
    }
    Err("Jetstream connection task ended".into())
}

async fn refresh_state(state: HttpStateLookup) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
    interval.tick().await;
    loop {
        interval.tick().await;
        match state.refresh().await {
            Ok(()) => info!("refreshed production state snapshot"),
            Err(error) => {
                warn!(%error, "could not refresh production state; retaining previous snapshot");
            }
        }
    }
}

async fn serve_health(port: u16, health: Arc<RwLock<Health>>) {
    let listener = match TcpListener::bind(("0.0.0.0", port)).await {
        Ok(listener) => listener,
        Err(error) => {
            error!(%error, port, "could not bind health server");
            return;
        }
    };
    loop {
        let Ok((mut stream, _)) = listener.accept().await else {
            continue;
        };
        let health = health.read().await;
        let body = serde_json::json!({
            "ok": true,
            "mode": "shadow",
            "jetstreamConnected": health.connected,
            "events": health.events,
            "decisions": health.decisions,
            "errors": health.errors,
        })
        .to_string();
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let _ = stream.write_all(response.as_bytes()).await;
    }
}
