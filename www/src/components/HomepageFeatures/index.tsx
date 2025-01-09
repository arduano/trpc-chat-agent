import type { ReactNode } from 'react';
import { BiPackage } from 'react-icons/bi';
import { HiPuzzle } from 'react-icons/hi';
import { TbActivityHeartbeat, TbRefresh } from 'react-icons/tb';
import { VscSymbolClass, VscTools } from 'react-icons/vsc';

type FeatureItem = {
  title: string;
  description: string;
  icon: ReactNode;
  iconClassName?: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'End-to-End Type Safety',
    description:
      'Every exposed API that allows custom types propagates them end-to-end, including to the frontend. No more type mismatches!',
    icon: <VscSymbolClass />,
    iconClassName: 'bg-blue-950 text-blue-400',
  },
  {
    title: 'Plug-and-Play',
    description:
      'First-class support for AI tool calls with real-time updates, interactive callbacks, and structured response types.',
    icon: <HiPuzzle />,
    iconClassName: 'bg-cyan-950 text-cyan-400',
  },
  {
    title: 'Automated State Management',
    description:
      'Client-side state is managed through signals and avoids redundant re-instancing of identical data for optimal performance.',
    icon: <TbRefresh />,
    iconClassName: 'bg-purple-950 text-purple-400',
  },
  {
    title: 'Framework Agnostic',
    description:
      'Adapters can be written for any LLM backend or frontend framework. Currently supports Langchain and React with more coming soon.',
    icon: <BiPackage />,
    iconClassName: 'bg-rose-950 text-rose-400',
  },
  {
    title: 'Client-Side Tool Previews',
    description:
      'Split client/server argument schemas allow the client to preview partial arguments before they are sent to the tool function.',
    icon: <VscTools />,
    iconClassName: 'bg-amber-950 text-amber-400',
  },
  {
    title: 'Minimized Re-rendering',
    description:
      'Built on tRPC primitives with a signals-based state approach, optimizing data flow and ensuring minimal re-renders.',
    icon: <TbActivityHeartbeat />,
    iconClassName: 'bg-emerald-950 text-emerald-400',
  },
];

function Feature({ title, description, icon, iconClassName }: FeatureItem) {
  return (
    <div className="flex flex-col gap-4">
      <div className={`w-14 h-14 rounded-lg p-3 text-2xl flex items-center justify-center ${iconClassName}`}>
        {icon}
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-foreground/70">{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className="py-24 px-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
        {FeatureList.map((props, idx) => (
          <Feature key={idx} {...props} />
        ))}
      </div>
    </section>
  );
}
