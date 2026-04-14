import { useMemo, useState } from 'react';
import {
  Folder, ChevronRight, ChevronDown, FileCode, CheckCircle2,
  Zap, XCircle, Brain, Wrench, PenTool,
  Terminal, Search, Copy, Check, Globe, Sparkles, FileText,
  Eye, ChevronUp,
} from 'lucide-react';

// ─── Stream Chunk Types ──────────────────────
// These match the backend StreamProcessor chunk types

interface StreamChunk {
  chunkType: string;  // text, thinking, tool_use, tool_result, code_write, code_block, progress, error, system, activity
  content: string;
  meta?: Record<string, any>;
}

// ─── Try to parse structured chunk from log line ──────────────────────
function tryParseChunk(raw: string): StreamChunk | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.chunkType === 'string') {
      return parsed as StreamChunk;
    }
  } catch {
    // Not JSON — treat as raw text
  }
  return null;
}

// ─── Parse blocks from either structured chunks or raw text ──────────────────────

interface ParsedBlock {
  type: 'text' | 'code' | 'heading' | 'bullet' | 'error' | 'success' | 'system'
    | 'file-nav' | 'thinking' | 'tool_use' | 'tool_result' | 'code_write' | 'progress'
    | 'activity' | 'numbered_list';
  content: string;
  lang?: string;
  files?: string[];
  meta?: Record<string, any>;
}

function parseBlocks(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  // Pre-process: split concatenated JSON objects (}{) by inserting newlines
  // This handles the case where WebSocket chunks arrive without separators
  const normalized = content.replace(/\}\s*\{/g, '}\n{');
  const lines = normalized.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Try structured chunk first ──
    const chunk = tryParseChunk(line);
    if (chunk) {
      switch (chunk.chunkType) {
        case 'thinking':
          blocks.push({ type: 'thinking', content: chunk.content, meta: chunk.meta });
          break;
        case 'tool_use':
          blocks.push({ type: 'tool_use', content: chunk.content, meta: chunk.meta });
          break;
        case 'tool_result':
          blocks.push({ type: 'tool_result', content: chunk.content, meta: chunk.meta });
          break;
        case 'code_write':
          blocks.push({ type: 'code_write', content: chunk.content, meta: chunk.meta });
          break;
        case 'code_block':
          blocks.push({ type: 'code', content: chunk.content, lang: chunk.meta?.lang || 'text' });
          break;
        case 'progress':
          blocks.push({ type: 'progress', content: chunk.content });
          break;
        case 'error':
          blocks.push({ type: 'error', content: chunk.content });
          break;
        case 'system':
          blocks.push({ type: 'system', content: chunk.content });
          break;
        case 'activity':
          blocks.push({ type: 'activity', content: chunk.content, meta: chunk.meta });
          break;
        default: {
          // Multi-line text chunks: parse content through fallback markdown parsers
          const innerContent = chunk.content;
          if (innerContent.includes('\n')) {
            // Insert lines into the processing queue for fallback parsing
            const innerLines = innerContent.split('\n');
            lines.splice(i + 1, 0, ...innerLines);
          } else {
            blocks.push({ type: 'text', content: innerContent });
          }
        }
      }
      i++;
      continue;
    }

    // ── Fallback: existing raw text parsing ──

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

    // Numbered list items
    if (/^\s*\d+\.\s/.test(line)) {
      blocks.push({ type: 'numbered_list', content: line.replace(/^\s*\d+\.\s+/, '') });
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
      !/^\s*[-*•]\s/.test(lines[i]) &&
      !/^\s*\d+\.\s/.test(lines[i]) &&
      !tryParseChunk(lines[i])
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
  const parts: (string | React.ReactElement)[] = [];
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
      parts.push(<strong key={keyIdx++} className="font-semibold text-foreground">{match[2]}</strong>);
    } else if (match[3]) {
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="text-[10px] text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1"
    >
      {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
    </button>
  );
}

function CodeBlock({ content, lang }: { content: string; lang: string }) {
  return (
    <div className="relative group my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1b26] rounded-t-lg border border-border/30 border-b-0">
        <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{lang}</span>
        <CopyButton text={content} />
      </div>
      <pre className="bg-[#1a1b26] p-3 rounded-b-lg border border-border/30 border-t-0 overflow-x-auto max-h-[400px]">
        <code className="text-[12px] leading-relaxed font-mono text-emerald-300/90">{content}</code>
      </pre>
    </div>
  );
}

function ThinkingBlock({ content, meta }: { content: string; meta?: Record<string, any> }) {
  const [expanded, setExpanded] = useState(false);

  if (meta?.state === 'start' && content === '🧠 Thinking...') {
    return (
      <div className="flex items-center gap-2 py-1.5 px-3 my-1 rounded-lg bg-purple-500/5 border border-purple-500/15">
        <Brain className="w-4 h-4 text-purple-400 animate-pulse" />
        <span className="text-purple-300/80 text-[12px] font-medium">Thinking...</span>
        <div className="flex gap-1 ml-2">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400/60 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400/60 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400/60 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="my-1.5 rounded-lg bg-purple-500/5 border border-purple-500/15 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-purple-500/10 transition-colors"
      >
        <Brain className="w-3.5 h-3.5 text-purple-400 shrink-0" />
        <span className="text-purple-300/80 text-[12px] font-medium">Internal Reasoning</span>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-purple-400/60 ml-auto" /> : <ChevronRight className="w-3.5 h-3.5 text-purple-400/60 ml-auto" />}
      </button>
      {expanded && (
        <div className="px-3 pb-2 text-[11px] text-purple-200/60 font-mono whitespace-pre-wrap border-t border-purple-500/10 pt-2 max-h-[200px] overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  );
}

function ToolUseBlock({ content, meta }: { content: string; meta?: Record<string, any> }) {
  const toolKey = (meta?.tool as string) || 'file_op';
  const toolIcons: Record<string, typeof Terminal> = { shell: Terminal, search: Search, file_op: PenTool };
  const toolLabels: Record<string, string> = { shell: 'Shell', search: 'Search', file_op: 'File Operation' };
  const Icon = toolIcons[toolKey] || Wrench;
  const toolLabel = toolLabels[toolKey] || 'Tool';

  return (
    <div className="flex items-start gap-2 py-1.5 px-3 my-1 rounded-lg bg-sky-500/5 border border-sky-500/15">
      <Icon className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[10px] text-sky-400/60 font-medium uppercase tracking-wider">{toolLabel}</span>
        <div className="text-[12px] text-sky-200/80 font-mono truncate mt-0.5">
          <InlineFormatted text={content} />
        </div>
      </div>
    </div>
  );
}

function CodeWriteBlock({ content, meta }: { content: string; meta?: Record<string, any> }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-3 my-1 rounded-lg bg-amber-500/5 border border-amber-500/15">
      <PenTool className="w-4 h-4 text-amber-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[10px] text-amber-400/60 font-medium uppercase tracking-wider">File Write</span>
        {meta?.file && (
          <div className="text-[12px] text-amber-200/80 font-mono truncate mt-0.5">
            {meta.file}
          </div>
        )}
        <div className="text-[11px] text-amber-200/60 mt-0.5">
          <InlineFormatted text={content} />
        </div>
      </div>
    </div>
  );
}

function ProgressBlock({ content }: { content: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 text-indigo-400/70 text-[12px]">
      <Zap className="w-3.5 h-3.5 shrink-0 animate-pulse" />
      <span className="font-medium"><InlineFormatted text={content.replace(/^⚡\s*/, '')} /></span>
    </div>
  );
}

// ─── Activity Block — Rich tool/function call UI ──────────────────────

const ACTIVITY_STYLES: Record<string, {
  icon: typeof Terminal;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}> = {
  tool_call: {
    icon: Wrench,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/5',
    borderColor: 'border-violet-500/20',
    label: 'Function Call',
  },
  read_file: {
    icon: FileText,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/5',
    borderColor: 'border-blue-500/20',
    label: 'Read File',
  },
  write_file: {
    icon: PenTool,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/5',
    borderColor: 'border-amber-500/20',
    label: 'Write File',
  },
  shell_cmd: {
    icon: Terminal,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/5',
    borderColor: 'border-emerald-500/20',
    label: 'Shell Command',
  },
  web_search: {
    icon: Globe,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/5',
    borderColor: 'border-cyan-500/20',
    label: 'Web Search',
  },
  search_code: {
    icon: Search,
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/5',
    borderColor: 'border-sky-500/20',
    label: 'Search',
  },
  skill_use: {
    icon: Sparkles,
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/5',
    borderColor: 'border-pink-500/20',
    label: 'Skill',
  },
  thinking: {
    icon: Brain,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/5',
    borderColor: 'border-purple-500/20',
    label: 'Thinking',
  },
};

function ActivityBlock({ content, meta }: { content: string; meta?: Record<string, any> }) {
  const [expanded, setExpanded] = useState(false);
  const activityType = meta?.activityType || 'tool_call';
  const style = ACTIVITY_STYLES[activityType] || ACTIVITY_STYLES.tool_call;
  const Icon = style.icon;
  const label = meta?.label || style.label;

  // Extract useful detail from metadata
  const detailParts: { key: string; value: string }[] = [];
  if (meta?.file) detailParts.push({ key: 'File', value: meta.file });
  if (meta?.command) detailParts.push({ key: 'Command', value: meta.command });
  if (meta?.query) detailParts.push({ key: 'Query', value: meta.query });
  if (meta?.url) detailParts.push({ key: 'URL', value: meta.url });
  if (meta?.tool) detailParts.push({ key: 'Tool', value: meta.tool });
  if (meta?.skill) detailParts.push({ key: 'Skill', value: meta.skill });
  if (meta?.transport) detailParts.push({ key: 'Transport', value: meta.transport });

  return (
    <div className={`my-1 rounded-lg ${style.bgColor} border ${style.borderColor} overflow-hidden transition-all`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.02] transition-colors`}
      >
        <div className={`w-6 h-6 rounded-md ${style.bgColor} border ${style.borderColor} flex items-center justify-center shrink-0`}>
          <Icon className={`w-3.5 h-3.5 ${style.color}`} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.color}`}>
              {label}
            </span>
            {meta?.op && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground/60 uppercase tracking-wider">
                {meta.op}
              </span>
            )}
          </div>
          {/* Show primary detail inline */}
          {detailParts.length > 0 && (
            <div className="text-[11px] text-foreground/60 font-mono truncate mt-0.5">
              {detailParts[0].value}
            </div>
          )}
        </div>
        <div className={`${style.color}/40`}>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {expanded && (
        <div className={`border-t ${style.borderColor} px-3 py-2 space-y-1.5`}>
          {/* Detail metadata grid */}
          {detailParts.map(({ key, value }) => (
            <div key={key} className="flex items-start gap-2 text-[11px]">
              <span className="text-muted-foreground/50 font-medium w-16 shrink-0">{key}</span>
              <span className="text-foreground/70 font-mono break-all">{value}</span>
            </div>
          ))}
          {/* Raw content */}
          {content && content !== detailParts[0]?.value && (
            <div className="text-[10px] text-muted-foreground/40 font-mono mt-1 pt-1 border-t border-white/[0.03]">
              {content}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Activity Summary — Collapsible group of consecutive activities ──────────────────────

function ActivityGroup({ blocks }: { blocks: ParsedBlock[] }) {
  const [expanded, setExpanded] = useState(false);
  
  if (blocks.length <= 2) {
    // Render individually if few
    return (
      <>
        {blocks.map((block, i) => (
          <ActivityBlock key={i} content={block.content} meta={block.meta} />
        ))}
      </>
    );
  }

  // Group summary: count of each type
  const typeCounts: Record<string, number> = {};
  for (const block of blocks) {
    const t = block.meta?.activityType || 'tool_call';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }

  return (
    <div className="my-1 rounded-lg bg-muted/20 border border-border/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors"
      >
        <Eye className="w-4 h-4 text-indigo-400 shrink-0" />
        <span className="text-[11px] text-foreground/70 font-medium">
          {blocks.length} tool activities
        </span>
        <div className="flex gap-1.5 ml-2 flex-wrap">
          {Object.entries(typeCounts).map(([type, count]) => {
            const s = ACTIVITY_STYLES[type] || ACTIVITY_STYLES.tool_call;
            return (
              <span key={type} className={`text-[9px] px-1.5 py-0.5 rounded-full ${s.bgColor} ${s.color} border ${s.borderColor}`}>
                {s.label}: {count}
              </span>
            );
          })}
        </div>
        <div className="ml-auto text-muted-foreground/40">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border/20 p-1.5 space-y-0.5 max-h-[400px] overflow-y-auto">
          {blocks.map((block, i) => (
            <ActivityBlock key={i} content={block.content} meta={block.meta} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────
export function OutputParser({ content }: { content: string }) {
  const blocks = useMemo(() => parseBlocks(content), [content]);
  const files = useMemo(() => extractFilePaths(content), [content]);

  // Group consecutive activity blocks
  const groupedBlocks = useMemo(() => {
    const groups: (ParsedBlock | ParsedBlock[])[] = [];
    let i = 0;
    while (i < blocks.length) {
      if (blocks[i].type === 'activity') {
        const activityGroup: ParsedBlock[] = [];
        while (i < blocks.length && blocks[i].type === 'activity') {
          activityGroup.push(blocks[i]);
          i++;
        }
        groups.push(activityGroup);
      } else {
        groups.push(blocks[i]);
        i++;
      }
    }
    return groups;
  }, [blocks]);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-sm leading-relaxed text-foreground/85">
        {groupedBlocks.map((item, idx) => {
          // Activity group
          if (Array.isArray(item)) {
            return <ActivityGroup key={idx} blocks={item} />;
          }

          const block = item;
          switch (block.type) {
            case 'code':
              return <CodeBlock key={idx} content={block.content} lang={block.lang || 'text'} />;

            case 'thinking':
              return <ThinkingBlock key={idx} content={block.content} meta={block.meta} />;

            case 'tool_use':
              return <ToolUseBlock key={idx} content={block.content} meta={block.meta} />;

            case 'tool_result':
              return (
                <div key={idx} className="flex items-start gap-2 py-1.5 px-3 my-1 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div className="text-[12px] text-emerald-200/80 font-mono whitespace-pre-wrap">
                    <InlineFormatted text={block.content} />
                  </div>
                </div>
              );

            case 'code_write':
              return <CodeWriteBlock key={idx} content={block.content} meta={block.meta} />;

            case 'progress':
              return <ProgressBlock key={idx} content={block.content} />;

            case 'activity':
              return <ActivityBlock key={idx} content={block.content} meta={block.meta} />;

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
                <div key={idx} className="flex items-center gap-2 py-1 text-muted-foreground/50 text-[11px]">
                  <Zap className="w-3 h-3 shrink-0" />
                  <span className="font-mono truncate"><InlineFormatted text={block.content.replace(/^⚡\s*/, '').replace(/^\[System\]\s*/, '')} /></span>
                </div>
              );

            case 'numbered_list':
              return (
                <div key={idx} className="flex items-start gap-2.5 py-0.5 pl-1">
                  <span className="text-indigo-400/60 font-mono text-[11px] w-4 text-right shrink-0 mt-0.5">
                    {/* Find original number */}
                    •
                  </span>
                  <span className="text-[13px]"><InlineFormatted text={block.content} /></span>
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
