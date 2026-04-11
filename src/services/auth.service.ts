import { createClient } from "@/lib/supabase/client";
import type { UpdateProfileData } from "@/types/auth";
import type { Profile } from "@/types/database";

export interface AuthResult {
  success: boolean;
  error: string | null;
}

export async function signUp(
  email: string,
  password: string,
  fullName: string
): Promise<AuthResult> {
  try {
    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function signIn(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function signOut(): Promise<AuthResult> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function getCurrentUser() {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

export async function sendPasswordReset(
  email: string
): Promise<AuthResult> {
  try {
    const supabase = createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function resetPassword(
  newPassword: string
): Promise<AuthResult> {
  try {
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function getProfile(
  userId: string
): Promise<{ data: Profile | null; error: string | null }> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single<Profile>();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch {
    return {
      data: null,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function updateProfile(
  userId: string,
  data: UpdateProfileData
): Promise<AuthResult> {
  try {
    const supabase = createClient();

    const updateData: {
      full_name: string;
      phone_number: string;
      updated_at: string;
    } = {
      full_name: data.full_name,
      phone_number: data.phone_number,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("profiles")
      .update(updateData as never)
      .eq("id", userId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function updatePassword(
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<AuthResult> {
  try {
    const supabase = createClient();

    // Verify current password by attempting sign in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (verifyError) {
      return { success: false, error: "Current password is incorrect." };
    }

    // Update to new password
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function deleteAccount(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const supabase = createClient();

    // Verify password first
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (verifyError) {
      return { success: false, error: "Incorrect password." };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not found." };
    }

    // Delete profile data (cascades will handle related tables)
    await supabase.from("profiles").delete().eq("id", user.id);

    // Sign out after deletion
    await supabase.auth.signOut();

    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}
