import { FileUp, Search, Folder, ChevronRight, FileCode, CheckCircle2 } from 'lucide-react';

export function OutputParser({ content }: { content: string }) {
  // A simple formatter for output parsing to make logs more beautiful
  // Identifies lines starting with [System] or tags and beautifies them
  // Parses file paths into clickable/navigable items

  const lines = content.split('\n');
  const files: string[] = [];
  
  // Extract file mentions roughly
  const parsedLines = lines.map((line, idx) => {
    // Detect file paths
    const fileMatch = line.match(/(?:[A-Z]:\\|\/)(?:[a-zA-Z0-9_\-.]+(?:\/|\\))+[a-zA-Z0-9_\-.]+\.\w+/g);
    if (fileMatch) {
      fileMatch.forEach(f => {
        if (!files.includes(f)) files.push(f);
      });
    }

    if (line.trim().startsWith('[System]')) {
      return <div key={idx} className="text-indigo-400 font-semibold my-1 flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> {line}</div>;
    }
    if (line.includes('Fatal') || line.includes('Error') || line.includes('error:')) {
      return <div key={idx} className="text-red-400 py-0.5">{line}</div>;
    }
    if (line.includes('Success') || line.includes('Done')) {
      return <div key={idx} className="text-green-400 py-0.5">{line}</div>;
    }
    if (line.startsWith('➜') || line.startsWith('$') || line.startsWith('>')) {
      return <div key={idx} className="text-blue-300 py-0.5 font-bold">{line}</div>;
    }
    
    // Highlight file paths in line if any
    let formattedLine = <span key={idx}>{line}</span>;
    if (fileMatch) {
      const parts = line.split(fileMatch[0]);
      formattedLine = (
        <span key={idx}>
          {parts[0]}<span className="text-emerald-400 underline decoration-emerald-500/30 cursor-pointer hover:bg-emerald-500/10 rounded px-1">{fileMatch[0]}</span>{parts[1] || ''}
        </span>
      );
    }

    return <div key={idx} className="py-[1px]">{formattedLine}</div>;
  });

  return (
    <div className="flex flex-col space-y-4">
      <div className="bg-background/40 p-3 rounded text-sm text-card-foreground shadow-sm">
        {parsedLines}
      </div>
      
      {/* Navigator for parsed files from the output */}
      {files.length > 0 && (
        <div className="mt-4 border border-border/60 bg-card rounded-lg overflow-hidden">
          <div className="bg-muted px-4 py-2 border-b border-border flex items-center gap-2">
            <Folder className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Output Files Navigator</span>
          </div>
          <div className="divide-y divide-border/50">
            {files.map((file, i) => {
              const filename = file.split('/').pop() || file.split('\\').pop() || file;
              return (
                <div key={i} className="flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer transition-colors group">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <FileCode className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="text-sm truncate text-foreground/90 font-mono group-hover:text-indigo-300 transition-colors">{filename}</span>
                    <span className="text-xs text-muted-foreground truncate hidden sm:block opacity-60 ml-2">{file}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
