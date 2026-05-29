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

/** Mocks the SSR client so auth.getUser() resolves to the given result. */
function mockGetUser(result: { data: { user: unknown }; error?: unknown }) {
  const getUser = vi.fn().mockResolvedValue(result);
  createServerSupabaseClient.mockReturnValue({ auth: { getUser } });
  return getUser;
}

describe("app middleware", () => {
  beforeEach(() => {
    createServerSupabaseClient.mockReset();
  });

  it("validates the request via getUser (not getSession)", async () => {
    const getUser = mockGetUser({ data: { user: { id: "u1", email: "a@b.test" } } });
    const locals: Record<string, unknown> = {};

    await handleAppRequest(
      createHandleAppRequestContext({
        request: new Request("http://localhost/app/overview"),
        cookies: {} as never,
        locals: locals as never,
        url: new URL("http://localhost/app/overview"),
        redirect: vi.fn(),
      }),
      createHandleAppRequestNext(vi.fn().mockResolvedValue(new Response("ok")))
    );

    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("redirects unauthenticated app requests to login", async () => {
    mockGetUser({ data: { user: null } });

    const redirect = vi.fn(
      (path: string) => new Response(null, { status: 302, headers: { location: path } })
    );
    const next = vi.fn();

    const response = await handleAppRequest(
      createHandleAppRequestContext({
        request: new Request("http://localhost/app/overview"),
        cookies: {} as never,
        locals: {} as never,
        url: new URL("http://localhost/app/overview"),
        redirect,
      }),
      createHandleAppRequestNext(next)
    );

    expect(redirect).toHaveBeenCalledWith("/login");
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toBe(302);
  });

  it("redirects app requests when getUser rejects the token (revoked/invalid)", async () => {
    // getUser validates against the Auth server; a revoked/expired/tampered
    // token yields a null user with an error — must NOT be allowed through.
    mockGetUser({ data: { user: null }, error: { message: "invalid JWT", status: 401 } });

    const redirect = vi.fn(
      (path: string) => new Response(null, { status: 302, headers: { location: path } })
    );
    const next = vi.fn();

    await handleAppRequest(
      createHandleAppRequestContext({
        request: new Request("http://localhost/app/calls"),
        cookies: {} as never,
        locals: {} as never,
        url: new URL("http://localhost/app/calls"),
        redirect,
      }),
      createHandleAppRequestNext(next)
    );

    expect(redirect).toHaveBeenCalledWith("/login");
    expect(next).not.toHaveBeenCalled();
  });

  it("allows authenticated app requests through and exposes the verified user", async () => {
    mockGetUser({ data: { user: { id: "user_1", email: "owner@example.test" } } });
    const locals: Record<string, unknown> = {};
    const next = vi.fn().mockResolvedValue(new Response("ok"));

    const response = await handleAppRequest(
      createHandleAppRequestContext({
        request: new Request("http://localhost/app/overview"),
        cookies: {} as never,
        locals: locals as never,
        url: new URL("http://localhost/app/overview"),
        redirect: vi.fn(),
      }),
      createHandleAppRequestNext(next)
    );

    expect(next).toHaveBeenCalled();
    expect(await response.text()).toBe("ok");
    expect((locals as { user?: { id: string } }).user?.id).toBe("user_1");
  });

  it("allows public requests through without a user", async () => {
    mockGetUser({ data: { user: null } });
    const next = vi.fn().mockResolvedValue(new Response("ok"));

    const response = await handleAppRequest(
      createHandleAppRequestContext({
        request: new Request("http://localhost/login"),
        cookies: {} as never,
        locals: {} as never,
        url: new URL("http://localhost/login"),
        redirect: vi.fn(),
      }),
      createHandleAppRequestNext(next)
    );

    expect(next).toHaveBeenCalled();
    expect(await response.text()).toBe("ok");
  });
});
