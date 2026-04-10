import type { APIRoute } from "astro";
import { supabase } from "../../../../utils/database";

export const prerender = false;

interface Framework {
  id: string;
  likes: number;
}

export const POST: APIRoute = async ({ params, redirect }) => {
  const { id } = params;
  if (!id) {
    return new Response("No framework id provided", { status: 400 });
  }

  if (supabase) {
    const { data: framework } = await supabase
      .from("frameworks")
      .select("*")
      .eq("id", id)
      .single();

    if (!framework) {
      return new Response(`Where'd that pet go?`, { status: 404 });
    }

    const typedFramework = framework as Framework;

    const { error: updateError } = await supabase
      .from("frameworks")
      .update({
        likes: typedFramework.likes + 1,
      })
      .eq("id", typedFramework.id);

    if (updateError) {
      console.error(updateError);
    }
    return redirect(`/frameworks/${typedFramework.id}`, 303);
  }

  return new Response("No supabase url provided", { status: 400 });
};
