/**
 * Test-support JSON Schema (2020-12) subset checker for the lesson-factory
 * contract suite.
 *
 * This is NOT a production validator and nothing outside `tests/` may import it.
 * The repository has no runtime JSON Schema dependency, so the deadline contracts
 * are proved here against a checker small enough to audit by eye. Its honesty
 * depends on two guardrails that live in the tests:
 *
 *  1. `auditSchema()` fails a contract that uses any keyword this checker does not
 *     implement, so a keyword can never be silently ignored into a pass.
 *  2. `json-schema-subset.test.ts` proves the checker actually rejects each
 *     construct the contracts rely on.
 */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type Schema = boolean | JsonObject;

/** Keywords carried for humans and tooling; they assert nothing. */
const ANNOTATION_KEYWORDS = [
  '$schema',
  '$id',
  '$defs',
  '$comment',
  'title',
  'description',
  'x_contract_id',
  'x_contract_version',
] as const;

/** Keywords this checker actually evaluates. */
const ASSERTION_KEYWORDS = [
  '$ref',
  'type',
  'enum',
  'const',
  'properties',
  'required',
  'additionalProperties',
  'propertyNames',
  'minProperties',
  'maxProperties',
  'items',
  'contains',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
] as const;

export const SUPPORTED_KEYWORDS: ReadonlySet<string> = new Set<string>([
  ...ANNOTATION_KEYWORDS,
  ...ASSERTION_KEYWORDS,
]);

/** Applicators whose subschemas refine an already-defined node rather than define one. */
const REFINEMENT_KEYWORDS: ReadonlySet<string> = new Set(['if', 'then', 'else', 'not']);

export type JsonType = 'null' | 'boolean' | 'number' | 'integer' | 'string' | 'array' | 'object';

export function jsonTypeOf(value: JsonValue): JsonType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const kind = typeof value;
  if (kind === 'boolean') return 'boolean';
  if (kind === 'string') return 'string';
  if (kind === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return 'object';
}

function isPlainObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && jsonTypeOf(value) === 'object';
}

/** Order-independent canonical form, used for `const`, `enum`, and `uniqueItems`. */
export function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key] as JsonValue)}`).join(',')}}`;
}

export class SchemaRegistry {
  private readonly byId = new Map<string, JsonObject>();

  add(schema: JsonObject): void {
    const id = schema.$id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('every registered contract schema must declare a string $id');
    }
    if (this.byId.has(id)) {
      throw new Error(`duplicate contract schema $id: ${id}`);
    }
    this.byId.set(id, schema);
  }

  get(id: string): JsonObject | undefined {
    return this.byId.get(id);
  }

  ids(): string[] {
    return [...this.byId.keys()];
  }
}

interface RefTarget {
  schema: Schema;
  base: string;
}

function resolveRef(ref: string, base: string, registry: SchemaRegistry): RefTarget {
  const hashIndex = ref.indexOf('#');
  const uri = hashIndex === -1 ? ref : ref.slice(0, hashIndex);
  const pointer = hashIndex === -1 ? '' : ref.slice(hashIndex + 1);
  const targetId = uri.length === 0 ? base : new URL(uri, base).href;
  const document = registry.get(targetId);
  if (document === undefined) {
    throw new Error(`unresolvable $ref "${ref}" (no registered schema with $id ${targetId})`);
  }
  if (pointer.length === 0) return { schema: document, base: targetId };
  if (!pointer.startsWith('/')) {
    throw new Error(`unsupported $ref fragment "${ref}" (only JSON pointers are supported)`);
  }
  let node: JsonValue = document;
  for (const rawSegment of pointer.slice(1).split('/')) {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isPlainObject(node) || !(segment in node)) {
      throw new Error(`unresolvable $ref "${ref}" (pointer segment "${segment}" is missing)`);
    }
    node = node[segment] as JsonValue;
  }
  if (typeof node !== 'boolean' && !isPlainObject(node)) {
    throw new Error(`unresolvable $ref "${ref}" (target is not a schema)`);
  }
  return { schema: node, base: targetId };
}

interface Context {
  registry: SchemaRegistry;
  errors: string[];
}

function fail(context: Context, path: string, message: string): void {
  context.errors.push(`${path === '' ? '<root>' : path}: ${message}`);
}

function validateNode(
  schema: Schema,
  data: JsonValue,
  base: string,
  path: string,
  context: Context,
): void {
  if (schema === true) return;
  if (schema === false) {
    fail(context, path, 'schema is `false`; no value is valid here');
    return;
  }

  if (typeof schema.$ref === 'string') {
    const target = resolveRef(schema.$ref, base, context.registry);
    validateNode(target.schema, data, target.base, path, context);
  }

  const actualType = jsonTypeOf(data);

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const matches = allowed.some(
      (candidate) =>
        candidate === actualType || (candidate === 'number' && actualType === 'integer'),
    );
    if (!matches) {
      fail(context, path, `expected type ${allowed.join('|')} but found ${actualType}`);
      return;
    }
  }

  if (schema.const !== undefined && canonicalize(data) !== canonicalize(schema.const)) {
    fail(
      context,
      path,
      `expected const ${JSON.stringify(schema.const)} but found ${JSON.stringify(data)}`,
    );
  }

  if (Array.isArray(schema.enum)) {
    const allowed = schema.enum.map(canonicalize);
    if (!allowed.includes(canonicalize(data))) {
      fail(
        context,
        path,
        `value ${JSON.stringify(data)} is not one of ${JSON.stringify(schema.enum)}`,
      );
    }
  }

  if (actualType === 'string') validateString(schema, data as string, path, context);
  if (actualType === 'number' || actualType === 'integer') {
    validateNumber(schema, data as number, path, context);
  }
  if (actualType === 'array') validateArray(schema, data as JsonValue[], base, path, context);
  if (actualType === 'object') validateObject(schema, data as JsonObject, base, path, context);

  validateApplicators(schema, data, base, path, context);
}

function validateString(schema: JsonObject, data: string, path: string, context: Context): void {
  if (typeof schema.minLength === 'number' && data.length < schema.minLength) {
    fail(context, path, `string shorter than minLength ${schema.minLength}`);
  }
  if (typeof schema.maxLength === 'number' && data.length > schema.maxLength) {
    fail(context, path, `string longer than maxLength ${schema.maxLength}`);
  }
  if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(data)) {
    fail(context, path, `string ${JSON.stringify(data)} does not match pattern ${schema.pattern}`);
  }
}

function validateNumber(schema: JsonObject, data: number, path: string, context: Context): void {
  if (typeof schema.minimum === 'number' && data < schema.minimum) {
    fail(context, path, `value ${data} is below minimum ${schema.minimum}`);
  }
  if (typeof schema.maximum === 'number' && data > schema.maximum) {
    fail(context, path, `value ${data} is above maximum ${schema.maximum}`);
  }
}

function validateArray(
  schema: JsonObject,
  data: JsonValue[],
  base: string,
  path: string,
  context: Context,
): void {
  if (typeof schema.minItems === 'number' && data.length < schema.minItems) {
    fail(context, path, `array has ${data.length} items, fewer than minItems ${schema.minItems}`);
  }
  if (typeof schema.maxItems === 'number' && data.length > schema.maxItems) {
    fail(context, path, `array has ${data.length} items, more than maxItems ${schema.maxItems}`);
  }
  if (schema.uniqueItems === true) {
    const seen = new Set<string>();
    for (const item of data) {
      const key = canonicalize(item);
      if (seen.has(key)) fail(context, path, `array contains a duplicate item ${key}`);
      seen.add(key);
    }
  }
  if (schema.items !== undefined) {
    const itemSchema = schema.items as Schema;
    data.forEach((item, index) => {
      validateNode(itemSchema, item, base, `${path}/${index}`, context);
    });
  }
  // `contains` is what makes a membership rule expressible: paired with `not`, it
  // states that a list holds a value exactly when some other field says it should.
  if (schema.contains !== undefined) {
    const containsSchema = schema.contains as Schema;
    const matched = data.some(
      (item, index) =>
        collectErrors(containsSchema, item, base, `${path}/${index}`, context.registry).length ===
        0,
    );
    if (!matched) {
      fail(context, path, `no array item matches the "contains" schema`);
    }
  }
}

function validateObject(
  schema: JsonObject,
  data: JsonObject,
  base: string,
  path: string,
  context: Context,
): void {
  const keys = Object.keys(data);
  const properties = isPlainObject(schema.properties) ? schema.properties : undefined;

  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (typeof key === 'string' && !(key in data)) {
        fail(context, path, `required property "${key}" is missing`);
      }
    }
  }
  if (typeof schema.minProperties === 'number' && keys.length < schema.minProperties) {
    fail(context, path, `object has ${keys.length} properties, fewer than ${schema.minProperties}`);
  }
  if (typeof schema.maxProperties === 'number' && keys.length > schema.maxProperties) {
    fail(context, path, `object has ${keys.length} properties, more than ${schema.maxProperties}`);
  }

  for (const key of keys) {
    const value = data[key] as JsonValue;
    if (schema.propertyNames !== undefined) {
      validateNode(schema.propertyNames as Schema, key, base, `${path}/${key}<name>`, context);
    }
    const propertySchema = properties?.[key];
    if (propertySchema !== undefined) {
      validateNode(propertySchema as Schema, value, base, `${path}/${key}`, context);
      continue;
    }
    if (schema.additionalProperties === undefined) continue;
    if (schema.additionalProperties === false) {
      fail(context, path, `property "${key}" is not allowed (contract is closed)`);
      continue;
    }
    validateNode(schema.additionalProperties as Schema, value, base, `${path}/${key}`, context);
  }
}

function validateApplicators(
  schema: JsonObject,
  data: JsonValue,
  base: string,
  path: string,
  context: Context,
): void {
  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach((branch) => validateNode(branch as Schema, data, base, path, context));
  }
  if (Array.isArray(schema.anyOf)) {
    const passing = schema.anyOf.filter(
      (branch) => collectErrors(branch as Schema, data, base, path, context.registry).length === 0,
    );
    if (passing.length === 0) fail(context, path, 'value matches no anyOf branch');
  }
  if (Array.isArray(schema.oneOf)) {
    const passing = schema.oneOf.filter(
      (branch) => collectErrors(branch as Schema, data, base, path, context.registry).length === 0,
    );
    if (passing.length !== 1) {
      fail(context, path, `value matches ${passing.length} oneOf branches, expected exactly 1`);
    }
  }
  if (schema.not !== undefined) {
    const errors = collectErrors(schema.not as Schema, data, base, path, context.registry);
    if (errors.length === 0) fail(context, path, 'value matches a forbidden `not` schema');
  }
  if (schema.if !== undefined) {
    const conditionErrors = collectErrors(schema.if as Schema, data, base, path, context.registry);
    const branch = conditionErrors.length === 0 ? schema.then : schema.else;
    if (branch !== undefined) validateNode(branch as Schema, data, base, path, context);
  }
}

function collectErrors(
  schema: Schema,
  data: JsonValue,
  base: string,
  path: string,
  registry: SchemaRegistry,
): string[] {
  const context: Context = { registry, errors: [] };
  validateNode(schema, data, base, path, context);
  return context.errors;
}

/**
 * Validate `data` against the registered schema with this `$id`.
 * Returns every violation; an empty array means the document conforms.
 */
export function validateAgainst(
  registry: SchemaRegistry,
  schemaId: string,
  data: JsonValue,
): string[] {
  const schema = registry.get(schemaId);
  if (schema === undefined) throw new Error(`no registered schema with $id ${schemaId}`);
  return collectErrors(schema, data, schemaId, '', registry);
}

export interface SchemaAudit {
  /** Every keyword the schema uses, including annotations. */
  keywords: Set<string>;
  /** Contract-discipline violations: unsupported keywords, open objects, dead branches. */
  problems: string[];
}

/**
 * Static audit of a contract schema: it must use only implemented keywords, close
 * every object it defines, and carry no branch that can never fire.
 */
export function auditSchema(schema: JsonObject): SchemaAudit {
  const keywords = new Set<string>();
  const problems: string[] = [];

  const walk = (node: Schema, path: string, isDefinition: boolean): void => {
    if (typeof node === 'boolean') return;

    for (const keyword of Object.keys(node)) {
      keywords.add(keyword);
      if (!SUPPORTED_KEYWORDS.has(keyword)) {
        problems.push(`${path}: keyword "${keyword}" is not implemented by the contract checker`);
      }
    }

    const definesObject = node.type === 'object' || node.properties !== undefined;
    if (isDefinition && definesObject && node.additionalProperties !== false) {
      problems.push(`${path}: object node must declare "additionalProperties": false`);
    }
    if ((node.then !== undefined || node.else !== undefined) && node.if === undefined) {
      problems.push(`${path}: "then"/"else" without "if" never fires`);
    }

    const defs = node.$defs;
    if (isPlainObject(defs)) {
      for (const [key, child] of Object.entries(defs)) {
        walk(child as Schema, `${path}/$defs/${key}`, true);
      }
    }
    // Everything below a refinement applicator refines an already-closed node, so
    // it stays a refinement: closing it would forbid the properties it refines.
    const properties = node.properties;
    if (isPlainObject(properties)) {
      for (const [key, child] of Object.entries(properties)) {
        walk(child as Schema, `${path}/properties/${key}`, isDefinition);
      }
    }
    if (node.items !== undefined) walk(node.items as Schema, `${path}/items`, isDefinition);
    if (node.contains !== undefined) walk(node.contains as Schema, `${path}/contains`, false);
    if (node.additionalProperties !== undefined && typeof node.additionalProperties !== 'boolean') {
      walk(node.additionalProperties as Schema, `${path}/additionalProperties`, isDefinition);
    }
    if (node.propertyNames !== undefined) {
      walk(node.propertyNames as Schema, `${path}/propertyNames`, false);
    }
    for (const container of ['allOf', 'anyOf', 'oneOf'] as const) {
      const value = node[container];
      if (Array.isArray(value)) {
        value.forEach((child, index) =>
          walk(child as Schema, `${path}/${container}/${index}`, false),
        );
      }
    }
    for (const keyword of REFINEMENT_KEYWORDS) {
      const value = node[keyword];
      if (value !== undefined) walk(value as Schema, `${path}/${keyword}`, false);
    }
  };

  walk(schema, '', true);
  return { keywords, problems };
}

/** Every `$ref` string the schema carries, in document order. */
export function collectRefs(schema: JsonObject): string[] {
  const refs: string[] = [];
  const walk = (node: JsonValue): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!isPlainObject(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') refs.push(value);
      else walk(value as JsonValue);
    }
  };
  walk(schema);
  return refs;
}

/** Every property name the schema declares, at any depth. */
export function collectPropertyNames(schema: JsonObject): string[] {
  const names: string[] = [];
  const walk = (node: JsonValue): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!isPlainObject(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'properties' && isPlainObject(value)) {
        names.push(...Object.keys(value));
      }
      walk(value as JsonValue);
    }
  };
  walk(schema);
  return names;
}

/** Deep clone with one property replaced at a slash-delimited path (for negative fixtures). */
export function withMutation(
  document: JsonObject,
  pointer: string,
  value: JsonValue | undefined,
): JsonObject {
  const clone = JSON.parse(JSON.stringify(document)) as JsonObject;
  const segments = pointer.split('/').filter((segment) => segment.length > 0);
  const last = segments.pop();
  if (last === undefined) throw new Error('withMutation requires a non-empty pointer');
  let node: JsonValue = clone;
  for (const segment of segments) {
    if (Array.isArray(node)) node = node[Number(segment)] as JsonValue;
    else if (isPlainObject(node)) node = node[segment] as JsonValue;
    else throw new Error(`withMutation cannot walk through ${segment} in ${pointer}`);
    if (node === undefined) throw new Error(`withMutation path ${pointer} does not exist`);
  }
  if (Array.isArray(node)) {
    if (value === undefined) node.splice(Number(last), 1);
    else node[Number(last)] = value;
  } else if (isPlainObject(node)) {
    if (value === undefined) delete node[last];
    else node[last] = value;
  } else {
    throw new Error(`withMutation cannot set ${last} on a non-container`);
  }
  return clone;
}
