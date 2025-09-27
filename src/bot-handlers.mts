import { ChatMessage } from '@skyware/bot';
import { createReply } from './common/create-reply.mts';

export const chatMessageHandler = async (message: ChatMessage) => {
  try {
    const sender = await message.getSender();
    console.log(`Received message from @${sender.handle}: ${message.text}`);

    const conversation = await message.getConversation();
    if (!conversation) return;

    await conversation.sendMessage({
      text: await createReply(sender, message),
    });
  } catch (error) {
    console.error(error);
  }
};

type XrpcErrorLike = {
  status?: number;
  kind?: string;
  description?: string;
};

const formatErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    const { status, kind, description } = error as XrpcErrorLike;
    const parts = [
      typeof status === 'number' ? `status ${status}` : undefined,
      kind,
      description,
    ].filter((part): part is string => Boolean(part));

    if (parts.length) {
      return parts.join(' – ');
    }
  }

  return String(error);
};

export const chatErrorHandler = async (error: unknown) => {
  console.error(`Bot error: ${formatErrorMessage(error)}`);
};
