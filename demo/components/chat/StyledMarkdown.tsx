import { cn } from '@/lib/utils';
import Markdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { Card } from '../ui/card';

export function StyledMarkdown({ children }: { children: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      className="space-y-4"
      components={{
        h1: ({ className, node, ...props }) => (
          <h1 className={cn('text-3xl font-bold mt-8 mb-6', className)} {...(props as any)} />
        ),
        h2: ({ className, node, ...props }) => (
          <h2 className={cn('text-2xl font-bold mt-6 mb-4', className)} {...(props as any)} />
        ),
        h3: ({ className, node, ...props }) => (
          <h3 className={cn('text-xl font-bold mt-4 mb-3', className)} {...(props as any)} />
        ),
        h4: ({ className, node, ...props }) => (
          <h4 className={cn('text-lg font-bold mt-3 mb-2', className)} {...(props as any)} />
        ),
        p: ({ className, node, ...props }) => <p className={cn('', className)} {...(props as any)} />,
        ul: ({ className, node, ...props }) => <ul className={cn('list-disc pl-8', className)} {...(props as any)} />,
        ol: ({ className, node, ...props }) => (
          <ol className={cn('list-decimal pl-8', className)} {...(props as any)} />
        ),
        li: ({ className, node, ...props }) => <li className={cn('mt-1 first:mt-0', className)} {...(props as any)} />,
        a: ({ className, node, ...props }) => (
          <a className={cn('text-slate-400 hover:text-slate-200 transition-colors', className)} {...(props as any)} />
        ),
        blockquote: ({ className, node, ...props }) => (
          <blockquote
            className={cn('border-l-4 border-accent pl-4 my-4 text-accent-foreground', className)}
            {...(props as any)}
          />
        ),
        pre: ({ className, node, ...props }) => (
          <Card className="p-4 border border-accent-foreground/20 w-full block rounded-lg">
            <pre {...(props as any)} />
          </Card>
        ),
        hr: ({ className, node, ...props }) => (
          <hr className={cn('my-6 border-t border-accent', className)} {...(props as any)} />
        ),
        table: ({ className, node, ...props }) => (
          <table className={cn('w-full border-collapse my-4', className)} {...(props as any)} />
        ),
        th: ({ className, node, ...props }) => (
          <th className={cn('border border-accent px-4 py-2 bg-accent font-bold', className)} {...(props as any)} />
        ),
        td: ({ className, node, ...props }) => (
          <td className={cn('border border-accent px-4 py-2', className)} {...(props as any)} />
        ),
        img: ({ className, node, ...props }) => (
          <img className={cn('max-w-full rounded-lg', className)} {...(props as any)} />
        ),
        code: ({ className, node, children, ...rest }) => {
          const match = /language-(\w+)/.exec(className || '');
          return match ? (
            <SyntaxHighlighter
              {...(rest as any)}
              PreTag="div"
              children={String(children).replace(/\n$/, '')}
              language={match[1]}
              style={themeWithoutBackgroundOrPadding(atomDark)}
              className={cn('p-0', className)}
            />
          ) : (
            <code className={cn('p-0', className)} {...(rest as any)}>
              {children}
            </code>
          );
        },
      }}
    >
      {children}
    </Markdown>
  );
}

function themeWithoutBackgroundOrPadding(theme: any) {
  const themeCloned = structuredClone(theme);
  theme['pre[class*="language-"]'].background = undefined;
  theme['pre[class*="language-"]'].padding = undefined;
  return themeCloned;
}
