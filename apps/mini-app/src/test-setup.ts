// @ts-expect-error https://thymikee.github.io/jest-preset-angular/docs/getting-started/test-environment
globalThis.ngJest = {
  testEnvironmentOptions: {
    errorOnUnknownElements: true,
    errorOnUnknownProperties: true,
  },
};
import 'jest-preset-angular/setup-jest';
import { TextDecoder, TextEncoder } from 'node:util';
import { deserialize, serialize } from 'node:v8';

// В окружении jsdom нет части Web API, которые есть и в браузере, и в Node:
// TextEncoder нужен для data URL, structuredClone — для fake-indexeddb.
Object.assign(globalThis, {
  TextEncoder: globalThis.TextEncoder ?? TextEncoder,
  TextDecoder: globalThis.TextDecoder ?? TextDecoder,
  structuredClone:
    globalThis.structuredClone ??
    (<T>(value: T): T => deserialize(serialize(value)) as T),
});
