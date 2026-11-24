"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, ImagePlus, ScanSearch, Trash2, X } from "lucide-react";
import type { SocialPlatform } from "@/db/schema";
import { SOCIAL_PLATFORMS } from "@/lib/platforms";
import { PlatformIcon } from "@/components/platform-icons";

interface UserProfileSummary {
  id: number;
  platform: SocialPlatform;
  handle: string;
  displayName: string;
  profileUrl: string;
  avatarPath: string;
  isUserAdded: boolean;
}

interface AddProfileModalProps {
  open: boolean;
  onClose: () => void;
  onProfileAdded: (profile: UserProfileSummary, uploadedFile: File | null) => void;
  onProfileDeleted: () => void;
}

export function AddProfileModal({
  open,
  onClose,
  onProfileAdded,
  onProfileDeleted,
}: AddProfileModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [verified, setVerified] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedResult, setAddedResult] = useState<{
    profile: UserProfileSummary;
    file: File | null;
  } | null>(null);
  const [userProfiles, setUserProfiles] = useState<UserProfileSummary[]>([]);

  useEffect(() => {
    if (!open) return;
    let active = true;

    fetch("/api/profiles")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.profiles) {
          setUserProfiles(
            (data.profiles as UserProfileSummary[]).filter((p) => p.isUserAdded)
          );
        }
      })
      .catch(() => undefined);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      active = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  if (!open) return null;

  function resetForm() {
    setDisplayName("");
    setHandle("");
    setProfileUrl("");
    setLocation("");
    setBio("");
    setVerified(false);
    setPhotoUrl("");
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
    setError(null);
  }

  function handleFileChange(file: File | undefined) {
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoUrl("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!photoFile && !photoUrl.trim()) {
      setError("Please upload a portrait photo or enter an image URL.");
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("platform", platform);
      fd.set("displayName", displayName.trim());
      fd.set("handle", handle.trim());
      if (profileUrl.trim()) fd.set("profileUrl", profileUrl.trim());
      if (bio.trim()) fd.set("bio", bio.trim());
      if (location.trim()) fd.set("location", location.trim());
      fd.set("verified", verified ? "true" : "false");
      if (photoFile) {
        fd.set("file", photoFile);
      } else {
        fd.set("imageUrl", photoUrl.trim());
      }

      const res = await fetch("/api/profiles", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Unable to index public profile.");
        return;
      }

      const created = data.profile as UserProfileSummary;
      const savedFile = photoFile;
      setUserProfiles((prev) => [created, ...prev]);
      setAddedResult({ profile: created, file: savedFile });
      resetForm();
    } catch {
      setError("Network error while indexing profile. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveUserProfile(id: number) {
    try {
      const res = await fetch(`/api/profiles/${id}`, { method: "DELETE" });
      if (res.ok) {
        setUserProfiles((prev) => prev.filter((p) => p.id !== id));
        onProfileDeleted();
      }
    } catch {
      // ignore
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-profile-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-[540px] overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div>
            <h2
              id="add-profile-title"
              className="font-display text-[17px] font-semibold text-[#111827]"
            >
              Index a public profile
            </h2>
            <p className="text-[12.5px] text-zinc-500">
              Add a public photo & social handle so future visual scans can match it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="p-6">
          {addedResult ? (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="font-display text-[17px] font-semibold text-[#111827]">
                Profile indexed
              </h3>
              <p className="mt-1 text-[13px] text-zinc-500">
                Visual fingerprint saved for{" "}
                <span className="font-medium text-[#111827]">
                  {addedResult.profile.displayName}
                </span>{" "}
                (<span className="font-mono">{addedResult.profile.handle}</span>).
              </p>

              <img
                src={addedResult.profile.avatarPath}
                alt={addedResult.profile.displayName}
                className="mt-4 h-24 w-24 rounded-2xl border border-zinc-200 object-cover object-top"
              />

              <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                {addedResult.file && (
                  <button
                    type="button"
                    onClick={() => {
                      onProfileAdded(addedResult.profile, addedResult.file);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#4338CA]"
                  >
                    <ScanSearch className="h-4 w-4" />
                    Test scan with this image
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onProfileAdded(addedResult.profile, null);
                    onClose();
                  }}
                  className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Platform Selection */}
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-zinc-600">
                  Social platform
                </label>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  {SOCIAL_PLATFORMS.map((p) => {
                    const active = platform === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPlatform(p.id)}
                        className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-[11px] font-medium transition-colors ${
                          active
                            ? "border-indigo-500 bg-indigo-50/70 text-indigo-700"
                            : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                        }`}
                      >
                        <PlatformIcon
                          platform={p.id}
                          className="h-4 w-4"
                          colored={!active}
                        />
                        {p.shortName}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Photo uploader */}
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-zinc-600">
                  Profile photo
                </label>
                <div className="flex items-center gap-3.5">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 transition-colors hover:border-indigo-400 hover:text-indigo-600"
                  >
                    {photoPreview ? (
                      <img
                        src={photoPreview}
                        alt="Selected portrait preview"
                        className="h-full w-full object-cover object-top"
                      />
                    ) : (
                      <ImagePlus className="h-5 w-5" />
                    )}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    className="sr-only"
                    onChange={(e) => handleFileChange(e.target.files?.[0])}
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      {photoFile ? "Change image" : "Choose file"}
                    </button>
                    <input
                      type="url"
                      value={photoUrl}
                      onChange={(e) => {
                        setPhotoUrl(e.target.value);
                        if (e.target.value) {
                          setPhotoFile(null);
                          if (photoPreview) {
                            URL.revokeObjectURL(photoPreview);
                            setPhotoPreview(null);
                          }
                        }
                      }}
                      placeholder="or paste image URL (https://...)"
                      className="block w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] text-[#111827] placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Name & Handle */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="profile-name"
                    className="mb-1 block text-[12px] font-medium text-zinc-600"
                  >
                    Display name
                  </label>
                  <input
                    id="profile-name"
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13.5px] text-[#111827] placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="profile-handle"
                    className="mb-1 block text-[12px] font-medium text-zinc-600"
                  >
                    Public handle
                  </label>
                  <input
                    id="profile-handle"
                    type="text"
                    required
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder={platform === "linkedin" ? "alex-morgan" : "@alexmorgan"}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-[13px] text-[#111827] placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Optional URL & Location */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="profile-url"
                    className="mb-1 block text-[12px] font-medium text-zinc-600"
                  >
                    Profile URL <span className="text-zinc-400">(optional)</span>
                  </label>
                  <input
                    id="profile-url"
                    type="url"
                    value={profileUrl}
                    onChange={(e) => setProfileUrl(e.target.value)}
                    placeholder="Auto-filled from handle"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-[#111827] placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="profile-location"
                    className="mb-1 block text-[12px] font-medium text-zinc-600"
                  >
                    Location <span className="text-zinc-400">(optional)</span>
                  </label>
                  <input
                    id="profile-location"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Austin, TX"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-[#111827] placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Bio */}
              <div>
                <label
                  htmlFor="profile-bio"
                  className="mb-1 block text-[12px] font-medium text-zinc-600"
                >
                  Short bio <span className="text-zinc-400">(optional)</span>
                </label>
                <input
                  id="profile-bio"
                  type="text"
                  maxLength={200}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Product designer, photographer, or public bio line"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-[#111827] placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-zinc-600">
                <input
                  type="checkbox"
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />
                Verified public account
              </label>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#4338CA] disabled:opacity-60"
                >
                  {submitting ? "Indexing photo..." : "Add to index"}
                </button>
              </div>
            </form>
          )}

          {/* User-indexed list for instant inspection/deletion */}
          {userProfiles.length > 0 && !addedResult && (
            <div className="mt-6 border-t border-zinc-100 pt-4">
              <p className="mb-2 text-[11.5px] font-medium tracking-wide text-zinc-400 uppercase">
                Added by you ({userProfiles.length})
              </p>
              <ul className="space-y-1.5">
                {userProfiles.map((up) => (
                  <li
                    key={up.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-[#FAFAFA] px-2.5 py-1.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <img
                        src={up.avatarPath}
                        alt={up.displayName}
                        className="h-7 w-7 rounded-full object-cover object-top"
                      />
                      <PlatformIcon platform={up.platform} className="h-3.5 w-3.5 shrink-0" colored />
                      <span className="truncate text-[12.5px] font-medium text-[#111827]">
                        {up.displayName}
                      </span>
                      <span className="truncate font-mono text-[11.5px] text-zinc-500">
                        {up.handle}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${up.handle}`}
                      onClick={() => handleRemoveUserProfile(up.id)}
                      className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
