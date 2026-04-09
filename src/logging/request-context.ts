import { AsyncLocalStorage } from "node:async_hooks";

import type {
  ConfluenceAccessLogContext,
  ResolvedConfluenceAuth,
} from "../confluence/runtime-auth.js";

export type RequestContext = {
  requestId: string;
  traceId: string;
  confluenceAccess?: ConfluenceAccessLogContext | null;
  runtimeConfluenceAuth?: ResolvedConfluenceAuth | null;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  return requestContextStorage.run(context, callback);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function getRequestLogContext():
  | {
      requestId: string;
      traceId: string;
      confluenceAccess?: ConfluenceAccessLogContext;
    }
  | undefined {
  const requestContext = getRequestContext();

  if (!requestContext) {
    return undefined;
  }

  return {
    requestId: requestContext.requestId,
    traceId: requestContext.traceId,
    ...(requestContext.confluenceAccess
      ? { confluenceAccess: requestContext.confluenceAccess }
      : {}),
  };
}

export function setRequestContextConfluenceAuth(input: {
  runtimeConfluenceAuth: ResolvedConfluenceAuth | null;
  confluenceAccess: ConfluenceAccessLogContext | null;
}) {
  const requestContext = getRequestContext();

  if (!requestContext) {
    return;
  }

  requestContext.runtimeConfluenceAuth = input.runtimeConfluenceAuth;
  requestContext.confluenceAccess = input.confluenceAccess;
}
