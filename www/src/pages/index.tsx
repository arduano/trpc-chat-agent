import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { Button } from '@site/src/components/ui/button';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import DemoVideo from '@site/static/img/demo.mp4';
import Layout from '@theme/Layout';
import { FaGithub } from 'react-icons/fa';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className="min-h-[calc(60vh)] flex items-center justify-center text-center relative overflow-hidden bg-gradient-to-b from-primary-50 to-primary-100 px-8 py-16">
      <div className="">
        <div className="max-w-4xl mx-auto">
          <Heading as="h1" className="text-4xl font-bold mb-4">
            {siteConfig.title}
          </Heading>
          <p className="text-xl mb-8">
            Build powerful, type-safe chat agents with tRPC. Seamless integration of LLM capabilities with end-to-end
            type safety and real-time updates.
          </p>
          <p className="text-sm italic">If you love tRPC, you'll love this tooklit</p>
        </div>
        <div className="rounded-lg overflow-hidden w-screen mx-auto my-4">
          <video src={DemoVideo} autoPlay loop muted playsInline className="w-full max-w-7xl" />
        </div>
        <div className="flex items-center justify-center gap-4 mb-8">
          <Link href="/docs/intro">
            <Button size="lg" className="px-8 cursor-pointer">
              Get Started
            </Button>
          </Link>
          <a href="https://github.com/arduano/trpc-chat-agent" target="_blank" rel="noreferrer">
            <Button variant="secondary" size="lg" className="px-8 cursor-pointer">
              <FaGithub className="mr-2" /> GitHub
            </Button>
          </a>
        </div>
        <p>Better homepage coming soon :)</p>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - ${siteConfig.tagline}`}
      description="Build powerful, type-safe chat agents with tRPC. Seamless integration of LLM capabilities with end-to-end type safety."
    >
      <HomepageHeader />
      <main className="bg-background">
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
