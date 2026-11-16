// The file access that the reader receives from whoever uses it: list a folder, read a file and
// join paths. The reader opens no file on its own, so that it can serve any
// host (the extension, another editor, an in-memory test) and never run workspace code.

export interface Entry {
  name: string;
  /** true when the entry is a folder. */
  directory: boolean;
}

export interface Files {
  /** The entries of a folder, in any order; `undefined` when the folder does not exist. */
  list(folder: string): Promise<Entry[] | undefined>;
  /** The UTF-8 content; `undefined` when the file does not exist. Other errors reject. */
  read(file: string): Promise<string | undefined>;
  /** Joins path parts with the system separator. */
  join(...parts: string[]): string;
}
