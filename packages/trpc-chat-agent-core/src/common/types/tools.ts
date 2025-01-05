import type { MessageContent } from '../messageContent';
import type { AnyStructuredChatTool } from '../structuredTool';

export type ToolCallState = 'loading' | 'complete' | 'aborted';

export type AdvancedToolCall<Tool extends AnyStructuredChatTool> = {
  id: string;
  name: Tool['TypeInfo']['Name'];
  args: Tool['TypeInfo']['Args'];
  // May or may not be present. Generally present when the tool finishes executing. Will be missing if execution was cancelled before completion.
  result?: MessageContent;
  state: ToolCallState;
  client: {
    args: Tool['TypeInfo']['ArgsForClient'];
    // May or may not be present. Generally present when the tool finishes executing. Will be missing if execution was cancelled before completion.
    result?: Tool['TypeInfo']['ResultForClient'];
  };
};

export type AdvancedToolCallFromToolsArray<Tools extends readonly AnyStructuredChatTool[]> = {
  [K in keyof Tools]: AdvancedToolCall<Tools[K]>;
}[number];

export type AdvancedToolCallClientSide<Tool extends AnyStructuredChatTool> = {
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

export type AdvancedToolCallClientSideFromToolsArray<Tools extends readonly AnyStructuredChatTool[]> = {
  [K in keyof Tools]: AdvancedToolCallClientSide<Tools[K]>;
}[number];
