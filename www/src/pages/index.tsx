import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import { Button } from '@site/src/components/ui/button';
import DemoVideo from '@site/static/img/demo.mp4';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { FaGithub } from 'react-icons/fa';
import { HomePageChat } from '../components/HomePageChat';

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
        <div className="rounded-lg overflow-hidden w-screen my-4">
          <video src={DemoVideo} autoPlay loop muted playsInline className="w-full mx-auto max-w-7xl" />
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
        <div className="flex flex-col items-center gap-2 text-xl text-gray-600">
          <span>Demo below</span>
          <svg
            className="w-6 h-6 animate-bounce"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const [beginChat, setBeginChat] = useState(false);
  const scrollTriggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setBeginChat(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '0px 0px -50% 0px', // Triggers when element reaches middle of viewport
      }
    );

    if (scrollTriggerRef.current) {
      observer.observe(scrollTriggerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <Layout
      title={`${siteConfig.title} - ${siteConfig.tagline}`}
      description="Build powerful, type-safe chat agents with tRPC. Seamless integration of LLM capabilities with end-to-end type safety."
    >
      <HomepageHeader />
      <main className="bg-background">
        <HomepageFeatures />

        <HomePageChat shouldBegin={beginChat} />
        {!beginChat && (
          <div>
            <div ref={scrollTriggerRef} className="text-center text-gray-600">
              Scroll further...
            </div>
          </div>
        )}
        <div className="h-[50vh]"></div>
      </main>
    </Layout>
  );
}
