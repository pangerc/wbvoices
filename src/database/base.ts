export type Options = {
  signal?: AbortSignal;
};

export type Pagination = {
  skip?: number;
  take?: number;
};

// TODO: change meta to doc to normalize
export type FuzzyQueryResult<T> = {
  id: string;
  meta: T;
  fuzzy?: FuzzyResult;
};

export type QueryResult<T> = {
  id: string;
  document: T;
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
