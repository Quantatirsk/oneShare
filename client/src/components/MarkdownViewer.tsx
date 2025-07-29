import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export function MarkdownViewer({ content, className = '' }: MarkdownViewerProps) {
  return (
    <div className={`prose prose-slate max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            
            if (className && language) {
              return (
                <div className="not-prose">
                  <SyntaxHighlighter
                    style={oneLight}
                    language={language}
                    PreTag="div"
                    showLineNumbers={true}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              );
            }
            
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto" {...props}>
                  {children}
                </table>
              </div>
            );
          },
          blockquote({ children, ...props }) {
            return (
              <blockquote className="border-l-4 border-primary/30 pl-4 italic" {...props}>
                {children}
              </blockquote>
            );
          },
          h1({ children, ...props }) {
            return (
              <h1 className="text-3xl font-bold mt-8 mb-4 border-b pb-2" {...props}>
                {children}
              </h1>
            );
          },
          h2({ children, ...props }) {
            return (
              <h2 className="text-2xl font-semibold mt-6 mb-3 border-b pb-1" {...props}>
                {children}
              </h2>
            );
          },
          h3({ children, ...props }) {
            return (
              <h3 className="text-xl font-semibold mt-5 mb-2" {...props}>
                {children}
              </h3>
            );
          },
          h4({ children, ...props }) {
            return (
              <h4 className="text-lg font-medium mt-4 mb-2" {...props}>
                {children}
              </h4>
            );
          },
          h5({ children, ...props }) {
            return (
              <h5 className="text-base font-medium mt-3 mb-1" {...props}>
                {children}
              </h5>
            );
          },
          h6({ children, ...props }) {
            return (
              <h6 className="text-sm font-medium mt-2 mb-1" {...props}>
                {children}
              </h6>
            );
          },
          p({ children, ...props }) {
            return (
              <p className="mb-4 leading-relaxed" {...props}>
                {children}
              </p>
            );
          },
          ul({ children, ...props }) {
            return (
              <ul className="list-disc list-inside mb-4 space-y-1" {...props}>
                {children}
              </ul>
            );
          },
          ol({ children, ...props }) {
            return (
              <ol className="list-decimal list-inside mb-4 space-y-1" {...props}>
                {children}
              </ol>
            );
          },
          li({ children, ...props }) {
            return (
              <li className="text-base" {...props}>
                {children}
              </li>
            );
          },
          a({ children, href, ...props }) {
            return (
              <a 
                href={href} 
                className="text-primary hover:text-primary/80 underline font-medium" 
                target="_blank" 
                rel="noopener noreferrer"
                {...props}
              >
                {children}
              </a>
            );
          },
          img({ src, alt, ...props }) {
            return (
              <img 
                src={src} 
                alt={alt} 
                className="max-w-full h-auto rounded-lg shadow-sm my-4"
                {...props}
              />
            );
          },
          hr(props) {
            return (
              <hr className="my-8 border-border" {...props} />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}