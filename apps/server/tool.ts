import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { RunnableConfig } from "@langchain/core/runnables";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ZodType, z } from "zod";
import { Debouncer } from "./src/debounce";

type DeepPartial<T> = T extends Record<string, infer U>
  ? { [K in keyof T]?: DeepPartial<U> }
  : T;

type RunnableConfigWithToolProgress<T extends ZodType<any> | null> =
  RunnableConfig & {
    sendProgress: T extends null
      ? never
      : (data: z.infer<NonNullable<T>>) => void;
  };

type ZodObjectAny = z.ZodObject<any, any, any, any>;

export class StructuredChatTool<
  Name extends string,
  Args extends ZodObjectAny,
  ToolProgressData extends ZodType<any> | null = null,
  Return = null,
  ArgsForClient = null,
  ResultForClient = null
> extends DynamicStructuredTool<Args> {
  // Helpers for type inference. These don't actually exist as values.
  TypeInfo: {
    Name: Name;
    Schema: Args;
    Args: z.infer<Args>;
    ToolProgressSchema: ToolProgressData;
    ToolProgress: ToolProgressData extends null
      ? null
      : z.infer<NonNullable<ToolProgressData>>;
    Return: Return;
    ArgsForClient: ArgsForClient;
    ResultForClient: ResultForClient;
  } = undefined as any;

  constructor(
    private readonly toolArgs: {
      name: Name;
      schema: Args;
      toolProgressSchema?: ToolProgressData;
      description: string;
      run: (
        args: z.infer<Args>,
        runManager?: CallbackManagerForToolRun,
        config?: RunnableConfigWithToolProgress<ToolProgressData>
      ) => Promise<Return>;
      mapArgsForClient?: (args: DeepPartial<z.infer<Args>>) => ArgsForClient;
      mapResultForClient?: (result: Return) => ResultForClient;
    }
  ) {
    // Called if the dynamic tool is executed directly from the Runnable interface.
    // Generally, this should not be used.
    const callInternal = (
      args: z.infer<Args>,
      runManager?: CallbackManagerForToolRun,
      config?: RunnableConfig
    ) => {
      const configWithToolProgress = {
        ...config,
        sendProgress: (data: any) => {},
      };

      return this.func(args, runManager, configWithToolProgress);
    };

    super({
      name: toolArgs.name,
      description: toolArgs.description,
      func: callInternal,
      schema: toolArgs.schema as any, // ??
    });
  }

  get mapArgsForClient() {
    return this.toolArgs.mapArgsForClient;
  }

  makeDebouncedArgsMapper(
    debounceMs: number,
    send: (args: ArgsForClient) => void
  ) {
    const mapArgs = this.mapArgsForClient;
    if (!mapArgs) {
      return null;
    }

    return new Debouncer(debounceMs, (args: DeepPartial<z.infer<Args>>) => {
      const argsForClient = mapArgs(args);
      send(argsForClient);
    });
  }

  get mapResultForClient() {
    return this.toolArgs.mapResultForClient;
  }
}

export type AnyStructuredChatTool = StructuredChatTool<
  string,
  any,
  any,
  any,
  any,
  any
>;
