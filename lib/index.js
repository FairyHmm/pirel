/**
 * Lightweight JS relational & aggregation engine
 */

export const indexBy = (data, key) => {
  const map = new Map();
  for (const item of data || []) {
    const k = item[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
};

export const join = (rows, index, key, alias) =>
  (rows || []).map((row) => ({
    ...row,
    [alias]: index.get(row[key]) || [],
  }));

// ====================
// Helpers
// ====================

/**
 * Groups an array into a plain object of arrays.
 * Accepts a string key or a selector function.
 */
export const groupBy = (data, keyOrFn) => {
  return (data || []).reduce((acc, item) => {
    const k = typeof keyOrFn === "function" ? keyOrFn(item) : item[keyOrFn];
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
};

/**
 * Counts the frequencies of items in an array.
 * Converts ['apt', 'house', 'apt'] to { apt: 2, house: 1 }
 */
export const countBy = (data, keyOrFn) => {
  return (data || []).reduce((acc, item) => {
    const k = typeof keyOrFn === "function" ? keyOrFn(item) : item[keyOrFn];
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
};

/**
 * Creates a flat key-to-object map for O(1) single-item lookups.
 * Useful if you ever need to find a specific apartment details by its ID instantly.
 */
export const indexOne = (data, key) => {
  return (data || []).reduce((acc, item) => {
    acc[item[key]] = item;
    return acc;
  }, {});
};

/**
 * Sums up values using an accessor function.
 */
export const sumBy = (items, fn) =>
  (items || []).reduce((sum, x) => sum + fn(x), 0);

// ====================
// Fully auto-joining pipe
// ====================
export const createPipe = (db) => {
  const wrap = (data) => ({
    value: data,

    /**
     * Auto-join by table name. Auto detects keys:
     * Finds fields ending with "_id" in the child table that match the parent table name
     */
    with(table) {
      const childTable = db?.[table];
      if (!childTable || !childTable.length || !this.value.length) return this;

      const parentTableName = this.value === undefined ? "" : table;

      // 1. Find parent key (usually "id")
      const parentKey = "id";

      // 2. Find foreign key in child table
      const sampleChild = childTable[0];
      let foreignKey = Object.keys(sampleChild).find(
        (k) =>
          k.endsWith("_id") &&
          k.replace(/_id$/, "") === this._inferParentName(),
      );

      // Fallback: any key ending with "_id"
      if (!foreignKey) {
        foreignKey = Object.keys(sampleChild).find((k) => k.endsWith("_id"));
      }

      const index = indexBy(childTable, foreignKey);
      return wrap(join(this.value, index, parentKey, table));
    },

    // Infer parent name from first column ending with "id"
    _inferParentName() {
      if (!this.value.length) return "";
      const keys = Object.keys(this.value[0]);
      // pick the first key that ends with "id" or is "id"
      const key = keys.find((k) => k.toLowerCase().includes("id"));
      if (!key) return "";
      return key === "id" ? "id" : key.replace(/_id$/, "");
    },

    map(fn) {
      return wrap(this.value.map(fn));
    },

    filter(fn) {
      return wrap(this.value.filter(fn));
    },

    pipe(...fns) {
      return wrap(fns.reduce((acc, fn) => fn(acc), this.value));
    },

    unwrap() {
      return this.value;
    },
  });

  return (data) => wrap(data);
};

// Shortcut
export const $ = (db, data) => createPipe(db)(data);
