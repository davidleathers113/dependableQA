import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("astro:middleware", () => ({
  defineMiddleware: (handler: unknown) => handler,
}));

vi.mock("./lib/supabase/server-client", () => ({
  createServerSupabaseClient,
}));

import { handleAppRequest } from "./middleware";

type HandleAppRequestContext = Parameters<typeof handleAppRequest>[0];
type HandleAppRequestNext = Parameters<typeof handleAppRequest>[1];

function createHandleAppRequestContext(
  context: Partial<HandleAppRequestContext>
): HandleAppRequestContext {
  return context as HandleAppRequestContext;
}

function createHandleAppRequestNext(
  next: Partial<HandleAppRequestNext>
): HandleAppRequestNext {
  return next as HandleAppRequestNext;
}

describe("app middleware", () => {
  beforeEach(() => {
    createServerSupabaseClient.mockReset();
  });

  it("redirects unauthenticated app requests to login", async () => {
    createServerSupabaseClient.mockReturnValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: null,
          },
        }),
      },
    });

    const redirect = vi.fn((path: string) => new Response(null, { status: 302, headers: { location: path } }));
    const next = vi.fn();

    const response = await handleAppRequest(
      createHandleAppRequestContext({
        cookies: {} as any,
        locals: {} as any,
        url: new URL("http://localhost/app/overview"),
        redirect,
      }),
      createHandleAppRequestNext(next)
    );

    expect(redirect).toHaveBeenCalledWith("/login");
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toBe(302);
  });

  it("allows public requests through", async () => {
    createServerSupabaseClient.mockReturnValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: null,
          },
        }),
      },
    });

    const next = vi.fn().mockResolvedValue(new Response("ok"));

    const response = await handleAppRequest(
      createHandleAppRequestContext({
        cookies: {} as any,
        locals: {} as any,
        url: new URL("http://localhost/login"),
        redirect: vi.fn(),
      }),
      createHandleAppRequestNext(next)
    );

    expect(next).toHaveBeenCalled();
    expect(await response.text()).toBe("ok");
  });
});
