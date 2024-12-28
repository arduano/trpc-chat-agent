import type { AdvancedToolCallClientSideFromToolsArray, AgentTools } from '@arduano/trpc-langchain-agent/common';
import type { AgentType } from '../../../server/src/agent';

export function RenderTool({ tool }: { tool: AdvancedToolCallClientSideFromToolsArray<AgentTools<AgentType>> }) {
  const getStatusColor = (state: typeof tool.state) => {
    switch (state) {
      case 'loading':
        return 'bg-blue-500';
      case 'complete':
        return 'bg-green-500';
      case 'aborted':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const renderToolContent = () => {
    switch (tool.name) {
      case 'calculator':
        return (
          <>
            <div className="flex gap-2">
              <span className="font-semibold">Operation:</span>
              <span>{tool.args?.operation}</span>
              <span className="font-semibold ml-4">Values:</span>
              <span>
                {tool.args?.a} and {tool.args?.b}
              </span>
            </div>
            {tool.result && (
              <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-4">
                {'error' in tool.result ? (
                  <div className="flex items-center gap-2 text-red-500">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>{tool.result.error}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-500">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-gray-500">Result</div>
                      <div className="text-lg font-semibold">{tool.result.result}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        );

      case 'weather':
        return (
          <>
            <div className="flex gap-2">
              <span className="font-semibold">City:</span>
              <span>{tool.args?.city}</span>
            </div>
            {tool.progressStatus?.status && (
              <div className="mt-1 text-sm text-gray-600">{tool.progressStatus.status}</div>
            )}
            {tool.result && (
              <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-500">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-sm text-gray-500">Temperature</div>
                        <div className="text-lg font-semibold">{tool.result.temp}°C</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Condition</div>
                        <div className="text-lg font-semibold capitalize">{tool.result.condition}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        );

      case 'todos':
        return (
          <>
            <div className="flex gap-2">
              <span className="font-semibold">Action:</span>
              <span>{tool.args?.action}</span>
              {tool.args?.task && (
                <>
                  <span className="font-semibold ml-4">Task:</span>
                  <span>{tool.args.task}</span>
                </>
              )}
            </div>
            {tool.result && (
              <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-500">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="mb-2 text-sm text-gray-500">
                      Last action: <span className="font-medium capitalize">{tool.result.action}</span>
                    </div>
                    {tool.result.todos.length === 0 ? (
                      <div className="text-gray-500 italic">No todos</div>
                    ) : (
                      <ul className="space-y-1">
                        {tool.result.todos.map((todo, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full border border-purple-200 bg-purple-50 text-xs text-purple-500">
                              {i + 1}
                            </div>
                            <span>{todo}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        );

      case 'timer':
        return (
          <>
            <div className="flex gap-2">
              <span className="font-semibold">Duration:</span>
              <span>{tool.args?.seconds} seconds</span>
            </div>
            {tool.state !== 'complete' && tool.progressStatus && (
              <div className="mt-1">
                <div className="flex items-center gap-2">
                  <div className="h-1 flex-grow rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${tool.progressStatus.progress}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600">{tool.progressStatus.message}</span>
                </div>
              </div>
            )}
            {tool.result && (
              <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100 text-yellow-500">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-gray-500">Duration</div>
                    <div className="text-lg font-semibold">{tool.result.duration} seconds</div>
                    <div className="mt-1 text-sm text-green-500">Completed successfully</div>
                  </div>
                </div>
              </div>
            )}
          </>
        );

      default:
        return <div className="text-gray-500">Unknown tool: {(tool as any).name}</div>;
    }
  };

  return (
    <div className="my-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${getStatusColor(tool.state)}`} />
        <h3 className="font-medium capitalize">{tool.name}</h3>
        <span className="text-sm text-gray-500">({tool.state})</span>
      </div>
      {renderToolContent()}
    </div>
  );
}
