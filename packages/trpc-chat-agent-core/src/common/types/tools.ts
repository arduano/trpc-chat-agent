import type { UserMessageContent } from '../messageContent';
import type { AnyStructuredChatTool } from '../structuredTool';

export type ToolCallState = 'loading' | 'complete' | 'aborted';

export type ToolCall<Tool extends AnyStructuredChatTool> = {
  id: string;
  name: Tool['TypeInfo']['Name'];
  args: Tool['TypeInfo']['Args'];
  // May or may not be present. Generally present when the tool finishes executing. Will be missing if execution was cancelled before completion.
  result?: UserMessageContent[];
  state: ToolCallState;
  client: {
    args: Tool['TypeInfo']['ArgsForClient'];
    // May or may not be present. Generally present when the tool finishes executing. Will be missing if execution was cancelled before completion.
    result?: Tool['TypeInfo']['ResultForClient'];
  };
};

export type ToolCallFromToolsArray<Tools extends readonly AnyStructuredChatTool[]> = {
  [K in keyof Tools]: ToolCall<Tools[K]>;
}[number];

export type ToolCallClientSide<Tool extends AnyStructuredChatTool> = {
  id: string;

  name: string extends Tool['TypeInfo']['Name'] ? string : Tool['TypeInfo']['Name']; // This hack is necessary because of some complex edge cases around the `any` type

  // May or may not be present. The name is known first, then the preview args get sent along after
  args?: Tool['TypeInfo']['ArgsForClient'];
  // May or may not be present. May be sent along when the tool is being executed. Does not persist.
  progressStatus?: Tool['TypeInfo']['ToolProgress'];
  // May or may not be present. Generally present when the tool finishes executing.
  result?: Tool['TypeInfo']['ResultForClient'];
  state: ToolCallState;
};

export type ToolCallClientSideFromToolsArray<Tools extends readonly AnyStructuredChatTool[]> = {
  [K in keyof Tools]: ToolCallClientSide<Tools[K]>;
}[number];
