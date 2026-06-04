export type Options = {
  signal?: AbortSignal;
} & Pagination;

export type Pagination = {
  skip?: number;
  take?: number;
};

export type QueryResult<T> = {
  id: string;
  meta?: T;
  fuzzy?: FuzzyResult;
};

export type FuzzyResult = {
  score: number;
  indexes: readonly number[];
};

export class Base {
  static instance: Base;
  static getInstance(): Base {
    if (!this.instance) {
      this.instance = new Base();
    }

    return this.instance;
  }
}
