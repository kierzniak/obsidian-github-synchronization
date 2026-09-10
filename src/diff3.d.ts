declare module 'diff3' {
  export default function merge(
    a: string[],
    base: string[],
    b: string[],
  ): Array<{
    ok?: string[];
    conflict?: { a: string[]; b: string[]; o: string[] };
  }>;
}
