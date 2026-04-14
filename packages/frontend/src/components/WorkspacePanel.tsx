import { useState, useEffect, useCallback } from 'react';
import {
  FolderOpen, FileText, ChevronRight, ChevronDown,
  RefreshCw, FileCode, FileImage, FileJson, File,
  PanelRightClose, FolderClosed,
  X, Copy, Check, Download, Trash2
} from 'lucide-react';

const API_BASE = 'http://localhost:8000';

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
  children_count?: number;
}

interface WorkspacePanelProps {
  sessionId: string | null;
  isOpen: boolean;
  onToggle: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(extension: string) {
  const iconProps = { className: 'w-3.5 h-3.5 shrink-0' };
  switch (extension) {
    case 'ts': case 'tsx': case 'js': case 'jsx':
    case 'py': case 'rs': case 'go': case 'rb':
    case 'java': case 'c': case 'cpp': case 'h':
    case 'sh': case 'bash': case 'zsh':
      return <FileCode {...iconProps} className={`${iconProps.className} text-blue-400`} />;
    case 'json': case 'yaml': case 'yml': case 'toml':
      return <FileJson {...iconProps} className={`${iconProps.className} text-amber-400`} />;
    case 'png': case 'jpg': case 'jpeg': case 'gif':
    case 'svg': case 'webp': case 'ico':
      return <FileImage {...iconProps} className={`${iconProps.className} text-emerald-400`} />;
    case 'md': case 'txt': case 'log': case 'csv':
      return <FileText {...iconProps} className={`${iconProps.className} text-slate-400`} />;
    default:
      return <File {...iconProps} className={`${iconProps.className} text-slate-500`} />;
  }
}

// ─── File Viewer Overlay ──────────────────────────
function FileViewer({
  sessionId,
  filePath,
  onClose,
  onDelete,
}: {
  sessionId: string;
  filePath: string;
  onClose: () => void;
  onDelete?: (path: string) => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [fileSize, setFileSize] = useState(0);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/sessions/${sessionId}/workspace/read?path=${encodeURIComponent(filePath)}`)
      .then(r => r.json())
      .then(data => {
        setContent(data.content);
        setTruncated(data.truncated || false);
        setFileSize(data.size || 0);
      })
      .catch(() => setContent('Error loading file'))
      .finally(() => setLoading(false));
  }, [sessionId, filePath]);

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    window.open(
      `${API_BASE}/api/sessions/${sessionId}/workspace/download?path=${encodeURIComponent(filePath)}`,
      '_blank'
    );
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/api/sessions/${sessionId}/workspace/file?path=${encodeURIComponent(filePath)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        onDelete?.(filePath);
        onClose();
      }
    } catch { /* ignore */ }
  };

  const fileName = filePath.split('/').pop() || filePath;
  const ext = fileName.split('.').pop() || '';

  return (
    <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-20 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-card/50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {getFileIcon(ext)}
          <span className="text-xs font-medium truncate">{fileName}</span>
          <span className="text-[10px] text-muted-foreground">{formatSize(fileSize)}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Copy contents"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleDownload}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Download file"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
              title="Delete file"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleDelete}
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              title="Click to confirm delete"
            >
              Confirm
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ml-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto custom-scrollbar p-3">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            <span className="text-xs">Loading...</span>
          </div>
        ) : truncated ? (
          <div className="text-xs text-muted-foreground text-center py-8">
            File too large to preview ({formatSize(fileSize)})
            <div className="mt-3">
              <button onClick={handleDownload} className="text-blue-400 hover:text-blue-300 flex items-center gap-1 mx-auto">
                <Download className="w-3.5 h-3.5" /> Download instead
              </button>
            </div>
          </div>
        ) : (
          <pre className="text-[11px] leading-relaxed text-foreground/80 font-mono whitespace-pre-wrap break-all">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Directory Node ──────────────────────────────
function DirectoryNode({
  entry,
  sessionId,
  depth,
  onFileClick,
}: {
  entry: FileEntry;
  sessionId: string;
  depth: number;
  onFileClick: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (children.length > 0 || loading) return;
    setLoading(true);
    fetch(`${API_BASE}/api/sessions/${sessionId}/workspace?path=${encodeURIComponent(entry.path)}`)
      .then(r => r.json())
      .then(data => setChildren(data.files || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId, entry.path, children.length, loading]);

  const reload = useCallback(() => {
    setChildren([]);
    setLoading(true);
    fetch(`${API_BASE}/api/sessions/${sessionId}/workspace?path=${encodeURIComponent(entry.path)}`)
      .then(r => r.json())
      .then(data => setChildren(data.files || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId, entry.path]);

  const toggle = () => {
    if (!expanded) load();
    setExpanded(!expanded);
  };

  return (
    <div>
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 w-full px-2 py-[5px] rounded-md hover:bg-muted/60 text-left group transition-colors"
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
          : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
        {expanded
          ? <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          : <FolderClosed className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />}
        <span className="text-xs truncate">{entry.name}</span>
        {entry.children_count !== undefined && entry.children_count > 0 && !expanded && (
          <span className="text-[10px] text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
            {entry.children_count}
          </span>
        )}
      </button>
      {expanded && (
        <div>
          {loading ? (
            <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${(depth + 1) * 14 + 8}px` }}>
              <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Loading...</span>
            </div>
          ) : children.length === 0 ? (
            <div className="text-[10px] text-muted-foreground italic py-1" style={{ paddingLeft: `${(depth + 1) * 14 + 20}px` }}>
              Empty
            </div>
          ) : (
            children.map(child =>
              child.type === 'directory' ? (
                <DirectoryNode
                  key={child.path}
                  entry={child}
                  sessionId={sessionId}
                  depth={depth + 1}
                  onFileClick={onFileClick}
                />
              ) : (
                <FileNode key={child.path} entry={child} depth={depth + 1} onClick={() => onFileClick(child.path)} sessionId={sessionId} onDelete={reload} />
              )
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── File Node ──────────────────────────────
function FileNode({
  entry,
  depth,
  onClick,
  sessionId,
  onDelete,
}: {
  entry: FileEntry;
  depth: number;
  onClick: () => void;
  sessionId?: string;
  onDelete?: () => void;
}) {
  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessionId) {
      window.open(
        `${API_BASE}/api/sessions/${sessionId}/workspace/download?path=${encodeURIComponent(entry.path)}`,
        '_blank'
      );
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!sessionId || !confirm(`Delete ${entry.name}?`)) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/sessions/${sessionId}/workspace/file?path=${encodeURIComponent(entry.path)}`,
        { method: 'DELETE' }
      );
      if (res.ok) onDelete?.();
    } catch { /* ignore */ }
  };

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 w-full px-2 py-[5px] rounded-md hover:bg-muted/60 text-left group transition-colors"
      style={{ paddingLeft: `${depth * 14 + 22}px` }}
    >
      {getFileIcon(entry.extension || '')}
      <span className="text-xs truncate flex-1">{entry.name}</span>
      <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {entry.size !== undefined && (
          <span className="text-[10px] text-muted-foreground mr-1">
            {formatSize(entry.size)}
          </span>
        )}
        {sessionId && (
          <>
            <span
              role="button"
              onClick={handleDownload}
              className="p-0.5 rounded hover:bg-blue-500/10 text-muted-foreground/50 hover:text-blue-400 transition-colors"
              title="Download"
            >
              <Download className="w-3 h-3" />
            </span>
            <span
              role="button"
              onClick={handleDelete}
              className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground/50 hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </span>
          </>
        )}
      </span>
    </button>
  );
}

// ─── Main Panel ──────────────────────────────
export function WorkspacePanel({ sessionId, isOpen, onToggle }: WorkspacePanelProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [workspaceDir, setWorkspaceDir] = useState('');
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);

  const loadRoot = useCallback(() => {
    if (!sessionId) return;
    setLoading(true);
    fetch(`${API_BASE}/api/sessions/${sessionId}/workspace`)
      .then(r => r.json())
      .then(data => {
        setFiles(data.files || []);
        setWorkspaceDir(data.workspace_dir || '');
        setFileCount((data.files || []).length);
      })
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    if (sessionId && isOpen) {
      loadRoot();
    } else {
      setFiles([]);
      setViewingFile(null);
    }
  }, [sessionId, isOpen, loadRoot]);

  if (!isOpen) return null;

  const shortPath = workspaceDir
    ? '…/' + workspaceDir.split('/').slice(-2).join('/')
    : '';

  return (
    <div
      className="w-72 border-l border-border/50 bg-background/50 backdrop-blur-md
                 flex flex-col shrink-0 relative overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-xs font-semibold tracking-wide uppercase text-foreground/70">
            Workspace
          </span>
          {fileCount > 0 && (
            <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full">
              {fileCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={loadRoot}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onToggle}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Close Workspace"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Workspace path */}
      {shortPath && (
        <div className="px-3 py-1.5 border-b border-border/20">
          <span className="text-[10px] text-muted-foreground font-mono truncate block" title={workspaceDir}>
            {shortPath}
          </span>
        </div>
      )}

      {/* File tree */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-1.5">
        {!sessionId ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 px-4">
            <FolderClosed className="w-8 h-8 mb-3 opacity-30" />
            <p className="text-xs text-center">Select a session to view its workspace</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            <span className="text-xs">Loading workspace...</span>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 px-4">
            <FolderOpen className="w-8 h-8 mb-3 opacity-30" />
            <p className="text-xs text-center">Workspace is empty</p>
            <p className="text-[10px] text-center mt-1 opacity-60">
              Files created by agents will appear here
            </p>
          </div>
        ) : (
          files.map(entry =>
            entry.type === 'directory' ? (
              <DirectoryNode
                key={entry.path}
                entry={entry}
                sessionId={sessionId!}
                depth={0}
                onFileClick={setViewingFile}
              />
            ) : (
              <FileNode
                key={entry.path}
                entry={entry}
                depth={0}
                onClick={() => setViewingFile(entry.path)}
                sessionId={sessionId!}
                onDelete={loadRoot}
              />
            )
          )
        )}
      </div>

      {/* File Viewer Overlay */}
      {viewingFile && sessionId && (
        <FileViewer
          sessionId={sessionId}
          filePath={viewingFile}
          onClose={() => setViewingFile(null)}
          onDelete={() => { setViewingFile(null); loadRoot(); }}
        />
      )}
    </div>
  );
}
