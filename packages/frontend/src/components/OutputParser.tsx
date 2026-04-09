import { useMemo } from 'react';
import {
  Folder, ChevronRight, FileCode, CheckCircle2,
  AlertTriangle, Zap, XCircle,
} from 'lucide-react';

// ─── Markdown-lite renderer ──────────────────────

interface ParsedBlock {
  type: 'text' | 'code' | 'heading' | 'bullet' | 'error' | 'success' | 'system' | 'file-nav';
  content: string;
  lang?: string;
  files?: string[];
}

function parseBlocks(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block: ```lang ... ```
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim() || 'text';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'code', content: codeLines.join('\n'), lang });
      continue;
    }

    // Heading: # ## ###
    if (/^#{1,3}\s/.test(line.trim())) {
      blocks.push({ type: 'heading', content: line.trim().replace(/^#{1,3}\s+/, '') });
      i++;
      continue;
    }

    // Error lines
    if (/(?:❌|Fatal|Error:|error:|FAILED|authentication_error)/i.test(line)) {
      blocks.push({ type: 'error', content: line });
      i++;
      continue;
    }

    // Success lines
    if (/(?:✅|✓|Success|Done|Complete)/i.test(line)) {
      blocks.push({ type: 'success', content: line });
      i++;
      continue;
    }

    // System lines
    if (/^⚡|^\[System\]/.test(line.trim())) {
      blocks.push({ type: 'system', content: line });
      i++;
      continue;
    }

    // Bullet points
    if (/^\s*[-*•]\s/.test(line)) {
      blocks.push({ type: 'bullet', content: line.replace(/^\s*[-*•]\s+/, '') });
      i++;
      continue;
    }

    // Regular text — accumulate consecutive lines
    const textLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('#') &&
      !/(?:❌|✅|⚡|\[System\])/.test(lines[i]) &&
      !/^\s*[-*•]\s/.test(lines[i])
    ) {
      textLines.push(lines[i]);
      i++;
    }
    const text = textLines.join('\n').trim();
    if (text) {
      blocks.push({ type: 'text', content: text });
    }
  }

  return blocks;
}

function extractFilePaths(content: string): string[] {
  const matches = content.match(/(?:[A-Z]:\\|\/)[a-zA-Z0-9_\-./\\]+\.\w+/g);
  return matches ? [...new Set(matches)] : [];
}

// ─── Inline formatting ──────────────────────
function InlineFormatted({ text }: { text: string }) {
  // Process **bold**, `code`, and file paths
  const parts: (string | JSX.Element)[] = [];
  let remaining = text;
  let keyIdx = 0;

  const regex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(remaining.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // **bold**
      parts.push(<strong key={keyIdx++} className="font-semibold text-foreground">{match[2]}</strong>);
    } else if (match[3]) {
      // `code`
      parts.push(
        <code key={keyIdx++} className="px-1.5 py-0.5 rounded bg-muted text-amber-300 text-[0.85em] font-mono">
          {match[3]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < remaining.length) {
    parts.push(remaining.slice(lastIndex));
  }

  return <>{parts.length > 0 ? parts : text}</>;
}

// ─── Block renderers ──────────────────────
function CodeBlock({ content, lang }: { content: string; lang: string }) {
  return (
    <div className="relative group my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1b26] rounded-t-lg border border-border/30 border-b-0">
        <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{lang}</span>
        <button
          onClick={() => navigator.clipboard.writeText(content)}
          className="text-[10px] text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Copy
        </button>
      </div>
      <pre className="bg-[#1a1b26] p-3 rounded-b-lg border border-border/30 border-t-0 overflow-x-auto">
        <code className="text-[12px] leading-relaxed font-mono text-emerald-300/90">{content}</code>
      </pre>
    </div>
  );
}

// ─── Main Component ──────────────────────
export function OutputParser({ content }: { content: string }) {
  const blocks = useMemo(() => parseBlocks(content), [content]);
  const files = useMemo(() => extractFilePaths(content), [content]);

  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm leading-relaxed text-foreground/85">
        {blocks.map((block, idx) => {
          switch (block.type) {
            case 'code':
              return <CodeBlock key={idx} content={block.content} lang={block.lang || 'text'} />;

            case 'heading':
              return (
                <div key={idx} className="text-base font-semibold text-foreground mt-3 mb-1 flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-indigo-500" />
                  {block.content}
                </div>
              );

            case 'error':
              return (
                <div key={idx} className="flex items-start gap-2 py-1.5 px-3 my-1 rounded-lg bg-red-500/10 border border-red-500/20">
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <span className="text-red-300 text-[13px]"><InlineFormatted text={block.content} /></span>
                </div>
              );

            case 'success':
              return (
                <div key={idx} className="flex items-start gap-2 py-1.5 px-3 my-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <span className="text-emerald-300 text-[13px]"><InlineFormatted text={block.content} /></span>
                </div>
              );

            case 'system':
              return (
                <div key={idx} className="flex items-center gap-2 py-1 text-indigo-400/70 text-[12px]">
                  <Zap className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-medium"><InlineFormatted text={block.content.replace(/^⚡\s*/, '').replace(/^\[System\]\s*/, '')} /></span>
                </div>
              );

            case 'bullet':
              return (
                <div key={idx} className="flex items-start gap-2 py-0.5 pl-2">
                  <span className="text-muted-foreground mt-1.5 text-[8px]">●</span>
                  <span className="text-[13px]"><InlineFormatted text={block.content} /></span>
                </div>
              );

            case 'text':
            default:
              return (
                <div key={idx} className="py-0.5 whitespace-pre-wrap">
                  <InlineFormatted text={block.content} />
                </div>
              );
          }
        })}
      </div>
      
      {/* File Navigator */}
      {files.length > 0 && (
        <div className="mt-3 border border-border/40 bg-card/50 rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-3 py-1.5 border-b border-border/30 flex items-center gap-2">
            <Folder className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">Referenced Files</span>
          </div>
          <div className="divide-y divide-border/20">
            {files.map((file, i) => {
              const filename = file.split('/').pop() || file.split('\\').pop() || file;
              return (
                <div key={i} className="flex items-center justify-between px-3 py-2 hover:bg-muted/30 cursor-pointer transition-colors group">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileCode className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="text-[12px] truncate font-mono text-foreground/80 group-hover:text-indigo-300 transition-colors">{filename}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
