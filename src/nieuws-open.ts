export type OpenFn = (k: string) => void;
export function useOpen(key: string, onOpen: OpenFn) {
  return (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onOpen(key);
  };
}

