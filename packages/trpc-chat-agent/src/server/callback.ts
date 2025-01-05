import type { z } from 'zod';

export type ToolCallback<Args extends z.ZodTypeAny, Return extends z.ZodTypeAny> = {
  args: Args;
  response: Return;
};

export type AnyToolCallback = ToolCallback<z.ZodTypeAny, z.ZodTypeAny>;

export type CallbackFunctions<Callbacks extends Record<string, AnyToolCallback>> = {
  [K in keyof Callbacks]: (args: z.infer<Callbacks[K]['args']>) => Promise<z.infer<Callbacks[K]['response']>>;
};

export type CallbackAddress = {
  conversationId: string;
  messageId: string;
  toolCallId: string;
  callbackId: string;
};

type CallbackResponder = {
  schema: z.ZodTypeAny;
  respond: (args: any) => void;
  cancel: () => void;
};

function callbackAddressToString(address: CallbackAddress) {
  return `conversationId: ${address.conversationId}, messageId: ${address.messageId}, toolCallId: ${address.toolCallId}, callbackId: ${address.callbackId}`;
}

export class CallbackManager {
  private responders: Record<string, Record<string, CallbackResponder>> = {};

  private getKeyForMessage(conversationId: string, messageId: string) {
    return `${conversationId} ${messageId}`;
  }

  private getKeyForCallback(toolCallId: string, callbackId: string) {
    return `${toolCallId} ${callbackId}`;
  }

  public getCallbackResponsePromise(address: CallbackAddress, responseSchema: z.ZodTypeAny) {
    const messageKey = this.getKeyForMessage(address.conversationId, address.messageId);
    const callbackKey = this.getKeyForCallback(address.toolCallId, address.callbackId);

    this.responders[messageKey] ??= {};
    const messageRespondersDict = this.responders[messageKey];

    if (messageRespondersDict[callbackKey]) {
      throw new Error(`Callback already exists for ${callbackAddressToString(address)}`);
    }

    const remove = () => {
      delete messageRespondersDict[callbackKey];
      if (Object.keys(messageRespondersDict).length === 0) {
        delete this.responders[messageKey];
      }
    };

    return new Promise((resolve, reject) => {
      messageRespondersDict[callbackKey] = {
        schema: responseSchema,
        respond: async (response) => {
          const parsed = await responseSchema.safeParse(response);
          if (!parsed.success) {
            throw new Error(
              `Received callback response did not match expected schema\nDetails: ${parsed.error.message}`
            );
          }

          remove();
          resolve(parsed.data);
        },
        cancel: () => {
          remove();
          reject(new CallbackCancelledError('Callback cancelled'));
        },
      };
    });
  }

  getResponderForCallback(address: CallbackAddress) {
    const messageKey = this.getKeyForMessage(address.conversationId, address.messageId);
    const callbackKey = this.getKeyForCallback(address.toolCallId, address.callbackId);

    const existingResponders = this.responders[messageKey];
    if (!existingResponders) {
      throw new Error(`No callback exists for ${callbackAddressToString(address)}`);
    }

    const responder = existingResponders[callbackKey];
    if (!responder) {
      throw new Error(`No callback exists for ${callbackAddressToString(address)}`);
    }

    return responder;
  }

  public respondToCallback(address: CallbackAddress, response: any) {
    const responder = this.getResponderForCallback(address);
    responder.respond(response);
  }

  public cancelCallback(address: CallbackAddress) {
    const responder = this.getResponderForCallback(address);
    responder.cancel();
  }

  public clearCallbacksForMessage(conversationId: string, messageId: string) {
    const key = this.getKeyForMessage(conversationId, messageId);

    const existingResponders = this.responders[key];
    if (existingResponders) {
      for (const callbackId in existingResponders) {
        existingResponders[callbackId].cancel();
      }
    }

    delete this.responders[key];
  }
}

export class CallbackCancelledError extends Error {}
