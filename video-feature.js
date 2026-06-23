(() => {
  "use strict";

  const BUCKET = "draft-videos";
  const MAX_FILE_BYTES = 100 * 1024 * 1024;
  const DEMO_STATE_KEY = "draft-video-state-v1";
  const DEMO_EVENT = "draft-video-demo-change";
  const DB_NAME = "draft-video-demo-db-v1";
  const DB_STORE = "videos";

  const isCommissionerPage = Boolean(document.getElementById("commissionerApp"));
  const isDisplayPage = Boolean(document.getElementById("displayApp"));
  if (!isCommissionerPage && !isDisplayPage) return;

  const configured = Boolean(window.DraftApp?.api?.configured);
  const config = window.APP_CONFIG || {};
  const client = configured
    ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY)
    : null;

  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[ch]));

  const formatBytes = bytes => {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 ** 2).toFixed(1)} MB`;
  };

  const createId = () => {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  function safeFileName(name) {
    return String(name || "media")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(-100) || "media";
  }

  const ALLOWED_MIME_TYPES = new Set([
    "video/mp4",
    "video/webm",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ]);

  function inferMimeType(file) {
    const supplied = String(file?.type || "").toLowerCase();
    if (ALLOWED_MIME_TYPES.has(supplied)) return supplied;

    const name = String(file?.name || "").toLowerCase();
    if (name.endsWith(".mp4")) return "video/mp4";
    if (name.endsWith(".webm")) return "video/webm";
    if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
    if (name.endsWith(".png")) return "image/png";
    if (name.endsWith(".webp")) return "image/webp";
    if (name.endsWith(".gif")) return "image/gif";
    return "";
  }

  function isAllowedMedia(file) {
    return Boolean(inferMimeType(file));
  }

  function isImageMedia(media) {
    return String(media?.mime_type || "").toLowerCase().startsWith("image/");
  }

  function commissionerPassword() {
    return sessionStorage.getItem("draft-commissioner-password") || "";
  }

  function displayIsOpen() {
    const app = $("displayApp");
    return Boolean(
      sessionStorage.getItem("draft-display-password") &&
      app &&
      !app.classList.contains("hidden")
    );
  }

  async function rpc(name, args = {}) {
    const result = await client.rpc(name, args);
    if (result.error) throw result.error;
    return result.data;
  }

  /* ---------- IndexedDB used only by the site's browser demo mode ---------- */

  function openDemoDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function demoStore(mode, action) {
    const db = await openDemoDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, mode);
      const store = transaction.objectStore(DB_STORE);
      let request;
      try {
        request = action(store);
      } catch (error) {
        db.close();
        reject(error);
        return;
      }
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  const demoList = async () => {
    const rows = await demoStore("readonly", store => store.getAll());
    return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  };

  const demoGet = id => demoStore("readonly", store => store.get(String(id)));
  const demoPut = row => demoStore("readwrite", store => store.put(row));
  const demoDelete = id => demoStore("readwrite", store => store.delete(String(id)));

  function getDemoState() {
    try {
      return JSON.parse(localStorage.getItem(DEMO_STATE_KEY)) || {
        playing: false,
        active_video_id: null
      };
    } catch (_) {
      return { playing: false, active_video_id: null };
    }
  }

  function setDemoState(state) {
    localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(DEMO_EVENT));
  }

  async function getVideos() {
    if (configured) {
      const rows = await rpc("admin_list_videos", {
        p_password: commissionerPassword()
      });
      return Array.isArray(rows) ? rows : [];
    }
    return demoList();
  }

  async function getActiveVideo() {
    if (configured) {
      const active = await rpc("get_active_video");
      return active || null;
    }

    const state = getDemoState();
    if (!state.playing || !state.active_video_id) return null;
    const video = await demoGet(state.active_video_id);
    if (!video) return null;

    return {
      id: video.id,
      name: video.name,
      storage_path: null,
      mime_type: video.mime_type,
      size_bytes: video.size_bytes,
      started_at: state.started_at,
      play_token: state.play_token,
      muted: Boolean(state.muted),
      demo_blob: video.blob
    };
  }

  async function uploadMedia(file, title) {
    if (!file) throw new Error("Choose an MP4, WebM, JPG, PNG, WebP, or GIF file.");
    if (!isAllowedMedia(file)) {
      throw new Error("Supported files: MP4, WebM, JPG, PNG, WebP, and GIF.");
    }
    if (file.size > MAX_FILE_BYTES) throw new Error("The media file must be 100 MB or smaller.");

    const displayName = String(title || file.name.replace(/\.[^.]+$/, "")).trim();
    if (!displayName) throw new Error("Type a media name.");
    const mimeType = inferMimeType(file);

    if (!configured) {
      const id = createId();
      await demoPut({
        id,
        name: displayName,
        original_name: file.name,
        mime_type: mimeType,
        size_bytes: file.size,
        blob: file,
        created_at: new Date().toISOString()
      });
      window.dispatchEvent(new CustomEvent(DEMO_EVENT));
      return;
    }

    const password = commissionerPassword();
    if (!password) throw new Error("Log in as commissioner again.");

    const path = `${Date.now()}-${createId()}-${safeFileName(file.name)}`;
    const upload = await client.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      contentType: mimeType,
      upsert: false
    });
    if (upload.error) throw upload.error;

    try {
      await rpc("admin_add_video", {
        p_password: password,
        p_name: displayName,
        p_storage_path: path,
        p_mime_type: mimeType,
        p_size_bytes: file.size
      });
    } catch (error) {
      await client.storage.from(BUCKET).remove([path]);
      throw error;
    }
  }

  async function playVideo(videoId, muted, pauseClock) {
    if (pauseClock && window.DraftApp?.api?.pausePick) {
      await window.DraftApp.api.pausePick(commissionerPassword());
    }

    if (configured) {
      await rpc("admin_play_video", {
        p_password: commissionerPassword(),
        p_video_id: Number(videoId),
        p_muted: Boolean(muted)
      });
      return;
    }

    const video = await demoGet(videoId);
    if (!video) throw new Error("Media file not found.");
    setDemoState({
      playing: true,
      active_video_id: String(videoId),
      started_at: new Date().toISOString(),
      play_token: createId(),
      muted: Boolean(muted)
    });
  }

  async function stopVideo() {
    if (configured) {
      await rpc("admin_stop_video", {
        p_password: commissionerPassword()
      });
      return;
    }
    setDemoState({
      playing: false,
      active_video_id: null,
      started_at: null,
      play_token: createId(),
      muted: false
    });
  }

  async function deleteVideo(video) {
    if (configured) {
      await rpc("admin_delete_video", {
        p_password: commissionerPassword(),
        p_video_id: Number(video.id)
      });
      if (video.storage_path) {
        const removal = await client.storage.from(BUCKET).remove([video.storage_path]);
        if (removal.error) {
          console.warn("Media metadata was deleted, but the storage file could not be removed.", removal.error);
        }
      }
      return;
    }

    const state = getDemoState();
    if (String(state.active_video_id) === String(video.id)) {
      await stopVideo();
    }
    await demoDelete(video.id);
    window.dispatchEvent(new CustomEvent(DEMO_EVENT));
  }

  async function videoUrl(video) {
    if (video.demo_blob) return URL.createObjectURL(video.demo_blob);
    const result = client.storage.from(BUCKET).getPublicUrl(video.storage_path);
    return result.data.publicUrl;
  }

  /* -------------------------- Commissioner screen ------------------------- */

  if (isCommissionerPage) {
    let refreshTimer = null;
    let commissionerStarted = false;

    function showVideoStatus(text, error = false) {
      const status = $("videoFeatureStatus");
      if (!status) return;
      status.textContent = text;
      status.className = `message video-status${error ? " error" : ""}`;
      status.classList.remove("hidden");
      clearTimeout(showVideoStatus.timer);
      showVideoStatus.timer = setTimeout(() => status.classList.add("hidden"), 5000);
    }

    function injectCommissionerUi() {
      if ($("draftVideoManager")) return;

      const messageCard = $("displayMessage")?.closest("section.card");
      if (!messageCard) return;

      const card = document.createElement("section");
      card.id = "draftVideoManager";
      card.className = "card video-manager-card";
      card.innerHTML = `
        <h2>🎬 Videos & Images on the Big Screen</h2>
        <p class="video-help">
          Upload a video or image, then choose what should take over the display.
          Videos return to the draft when they end. Images stay up until you stop them.
        </p>

        <div class="video-upload-grid">
          <input id="videoFeatureName" class="big-input" type="text"
                 placeholder="Media name, such as Team Introduction">
          <input id="videoFeatureFile" class="video-file-picker" type="file"
                 accept="video/mp4,video/webm,image/jpeg,image/png,image/webp,image/gif,.mp4,.webm,.jpg,.jpeg,.png,.webp,.gif">
          <label class="video-option">
            <input id="videoFeaturePauseClock" type="checkbox" checked>
            Pause the draft clock before showing media
          </label>
          <label class="video-option">
            <input id="videoFeatureStartMuted" type="checkbox">
            Start videos muted
          </label>
          <button id="videoFeatureUpload" class="big-button green">⬆️ Upload Media</button>
        </div>

        <div id="videoFeatureStatus" class="message video-status hidden"></div>
        <div id="videoFeatureLibrary" class="video-library"></div>
        <button id="videoFeatureStop" class="big-button red video-stop-button">
          ⏹️ Stop Media and Return to Draft
        </button>
      `;
      messageCard.insertAdjacentElement("afterend", card);

      $("videoFeatureUpload").addEventListener("click", async () => {
        const button = $("videoFeatureUpload");
        const file = $("videoFeatureFile").files?.[0];
        const title = $("videoFeatureName").value.trim();
        button.disabled = true;
        button.textContent = "Uploading…";
        try {
          await uploadMedia(file, title);
          $("videoFeatureFile").value = "";
          $("videoFeatureName").value = "";
          showVideoStatus("Media uploaded!");
          await refreshCommissionerLibrary();
        } catch (error) {
          showVideoStatus(error.message || String(error), true);
        } finally {
          button.disabled = false;
          button.textContent = "⬆️ Upload Media";
        }
      });

      $("videoFeatureStop").addEventListener("click", async () => {
        try {
          await stopVideo();
          showVideoStatus("Media stopped. The draft is back on the big screen.");
          await refreshCommissionerLibrary();
        } catch (error) {
          showVideoStatus(error.message || String(error), true);
        }
      });
    }

    async function openPreview(video) {
      let url;
      try {
        url = await videoUrl(video);
      } catch (error) {
        showVideoStatus(error.message || String(error), true);
        return;
      }

      const imageMode = isImageMedia(video);
      const backdrop = document.createElement("div");
      backdrop.className = "video-preview-backdrop";
      backdrop.innerHTML = `
        <div class="video-preview-box">
          ${imageMode
            ? '<img alt="Media preview">'
            : '<video controls autoplay playsinline></video>'}
          <button class="video-preview-close">Close Preview</button>
        </div>
      `;

      const mediaElement = backdrop.querySelector(imageMode ? "img" : "video");
      mediaElement.src = url;

      const close = () => {
        if (!imageMode) {
          mediaElement.pause();
          mediaElement.removeAttribute("src");
          mediaElement.load();
        } else {
          mediaElement.removeAttribute("src");
        }
        if (String(url).startsWith("blob:")) URL.revokeObjectURL(url);
        backdrop.remove();
      };
      backdrop.querySelector(".video-preview-close").onclick = close;
      backdrop.addEventListener("click", event => {
        if (event.target === backdrop) close();
      });
      document.body.appendChild(backdrop);
    }

    async function refreshCommissionerLibrary() {
      if (!commissionerPassword()) return;
      injectCommissionerUi();
      const library = $("videoFeatureLibrary");
      if (!library) return;

      try {
        const [videos, active] = await Promise.all([getVideos(), getActiveVideo()]);
        if (!videos.length) {
          library.innerHTML = `
            <div class="video-library-empty">
              No videos or images uploaded yet.
            </div>
          `;
          return;
        }

        library.innerHTML = videos.map(video => {
          const playing = active && String(active.id) === String(video.id);
          return `
            <div class="video-library-row${playing ? " is-playing" : ""}" data-video-id="${escapeHtml(video.id)}">
              <div>
                <div class="video-library-name">
                  ${playing ? "▶️ " : (isImageMedia(video) ? "🖼️ " : "🎬 ")}${escapeHtml(video.name)}
                </div>
                <div class="video-library-meta">
                  ${escapeHtml(video.mime_type || "media")} · ${formatBytes(video.size_bytes)}
                  ${playing ? " · Showing on big screen" : ""}
                </div>
              </div>
              <div class="video-row-actions">
                <button class="video-small-button light" data-video-action="preview">Preview</button>
                <button class="video-small-button" data-video-action="play">Show on Big Screen</button>
                <button class="video-small-button red" data-video-action="delete">Delete</button>
              </div>
            </div>
          `;
        }).join("");

        library.querySelectorAll("[data-video-action]").forEach(button => {
          button.addEventListener("click", async () => {
            const row = button.closest("[data-video-id]");
            const video = videos.find(item => String(item.id) === String(row.dataset.videoId));
            if (!video) return;

            const action = button.dataset.videoAction;
            if (action === "preview") {
              await openPreview(video);
              return;
            }

            if (action === "delete") {
              if (!confirm(`Delete "${video.name}"?`)) return;
              try {
                await deleteVideo(video);
                showVideoStatus("Media deleted.");
                await refreshCommissionerLibrary();
              } catch (error) {
                showVideoStatus(error.message || String(error), true);
              }
              return;
            }

            button.disabled = true;
            try {
              await playVideo(
                video.id,
                $("videoFeatureStartMuted").checked,
                $("videoFeaturePauseClock").checked
              );
              showVideoStatus(`"${video.name}" is now showing on the big screen.`);
              await refreshCommissionerLibrary();
            } catch (error) {
              showVideoStatus(error.message || String(error), true);
            } finally {
              button.disabled = false;
            }
          });
        });
      } catch (error) {
        library.innerHTML = `
          <div class="message error">
            ${escapeHtml(error.message || String(error))}
          </div>
        `;
      }
    }

    function startCommissionerFeature() {
      injectCommissionerUi();
      if (commissionerStarted) return;
      commissionerStarted = true;
      refreshCommissionerLibrary();
      refreshTimer = setInterval(refreshCommissionerLibrary, 3000);

      window.addEventListener("storage", event => {
        if (!configured && event.key === DEMO_STATE_KEY) refreshCommissionerLibrary();
      });
      window.addEventListener(DEMO_EVENT, refreshCommissionerLibrary);

      if (configured) {
        client.channel("draft-video-commissioner")
          .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "draft_settings"
          }, refreshCommissionerLibrary)
          .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "draft_videos"
          }, refreshCommissionerLibrary)
          .subscribe();
      }
    }

    const commissionerObserver = new MutationObserver(() => {
      const app = $("commissionerApp");
      if (app && !app.classList.contains("hidden") && commissionerPassword()) {
        startCommissionerFeature();
      }
    });
    commissionerObserver.observe($("commissionerApp"), {
      attributes: true,
      attributeFilter: ["class"]
    });

    if (!$("commissionerApp").classList.contains("hidden") && commissionerPassword()) {
      startCommissionerFeature();
    }
  }

  /* ----------------------------- Display screen --------------------------- */

  if (isDisplayPage) {
    let currentToken = null;
    let currentObjectUrl = null;
    let checking = false;

    function injectDisplayUi() {
      if ($("draftVideoOverlay")) return;
      const overlay = document.createElement("div");
      overlay.id = "draftVideoOverlay";
      overlay.className = "draft-video-overlay hidden";
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = `
        <div id="draftVideoTitle" class="draft-video-title"></div>
        <video id="draftDisplayVideo" playsinline preload="auto"></video>
        <img id="draftDisplayImage" class="hidden" alt="Big-screen image">
        <div class="draft-video-controls">
          <button id="draftVideoPlayButton" class="draft-video-play hidden">▶️ Play Video</button>
          <button id="draftVideoSoundButton" class="draft-video-sound hidden">🔊 Turn On Sound</button>
        </div>
      `;
      document.body.appendChild(overlay);

      $("draftVideoPlayButton").addEventListener("click", async () => {
        try {
          await $("draftDisplayVideo").play();
          $("draftVideoPlayButton").classList.add("hidden");
        } catch (_) {}
      });

      $("draftVideoSoundButton").addEventListener("click", async () => {
        const player = $("draftDisplayVideo");
        player.muted = false;
        try {
          await player.play();
          $("draftVideoSoundButton").classList.add("hidden");
          $("draftVideoPlayButton").classList.add("hidden");
        } catch (_) {}
      });

      overlay.addEventListener("click", async event => {
        if (event.target.closest("button")) return;
        const player = $("draftDisplayVideo");
        if (player.classList.contains("hidden")) return;
        if (player.paused) {
          try {
            await player.play();
            $("draftVideoPlayButton").classList.add("hidden");
          } catch (_) {}
        }
      });

      $("draftDisplayVideo").addEventListener("ended", finishCurrentVideo);
    }

    function clearCurrentVideo() {
      injectDisplayUi();
      const overlay = $("draftVideoOverlay");
      const player = $("draftDisplayVideo");
      const image = $("draftDisplayImage");
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
      player.pause();
      player.removeAttribute("src");
      player.load();
      player.classList.remove("hidden");
      image.removeAttribute("src");
      image.classList.add("hidden");
      $("draftVideoPlayButton").classList.add("hidden");
      $("draftVideoSoundButton").classList.add("hidden");
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
      currentToken = null;
    }

    async function finishCurrentVideo() {
      const token = currentToken;
      if (!token) {
        clearCurrentVideo();
        return;
      }

      try {
        if (configured) {
          const active = await getActiveVideo();
          if (active && String(active.play_token) === String(token)) {
            await rpc("public_video_finished", {
              p_video_id: Number(active.id),
              p_play_token: active.play_token
            });
          }
        } else {
          const state = getDemoState();
          if (String(state.play_token) === String(token)) {
            setDemoState({
              playing: false,
              active_video_id: null,
              started_at: null,
              play_token: createId(),
              muted: false
            });
          }
        }
      } catch (error) {
        console.warn("Could not mark video complete.", error);
      } finally {
        clearCurrentVideo();
      }
    }

    async function beginVideo(active) {
      injectDisplayUi();
      const overlay = $("draftVideoOverlay");
      const player = $("draftDisplayVideo");
      const image = $("draftDisplayImage");
      const imageMode = isImageMedia(active);

      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;

      const url = await videoUrl(active);
      if (String(url).startsWith("blob:")) currentObjectUrl = url;

      currentToken = String(active.play_token || `${active.id}-${active.started_at}`);
      $("draftVideoTitle").textContent = active.name || "";
      overlay.classList.remove("hidden");
      overlay.setAttribute("aria-hidden", "false");

      if (imageMode) {
        player.pause();
        player.removeAttribute("src");
        player.load();
        player.classList.add("hidden");
        image.src = url;
        image.alt = active.name || "Big-screen image";
        image.classList.remove("hidden");
        $("draftVideoPlayButton").classList.add("hidden");
        $("draftVideoSoundButton").classList.add("hidden");
        return;
      }

      image.removeAttribute("src");
      image.classList.add("hidden");
      player.classList.remove("hidden");
      player.pause();
      player.src = url;
      player.muted = Boolean(active.muted);
      player.load();

      player.addEventListener("loadedmetadata", () => {
        const started = new Date(active.started_at).getTime();
        const elapsed = Math.max(0, (Date.now() - started) / 1000);
        if (Number.isFinite(player.duration) && elapsed > 1 && elapsed < player.duration - 0.5) {
          player.currentTime = elapsed;
        }
      }, { once: true });

      $("draftVideoPlayButton").classList.add("hidden");
      $("draftVideoSoundButton").classList.toggle("hidden", player.muted);

      try {
        await player.play();
      } catch (_) {
        if (!player.muted) {
          player.muted = true;
          try {
            await player.play();
            $("draftVideoSoundButton").classList.remove("hidden");
            return;
          } catch (_) {}
        }
        $("draftVideoPlayButton").classList.remove("hidden");
      }
    }

    async function checkDisplayVideo() {
      if (checking) return;
      checking = true;
      try {
        if (!displayIsOpen()) {
          if (currentToken) clearCurrentVideo();
          return;
        }

        const active = await getActiveVideo();
        if (!active) {
          if (currentToken) clearCurrentVideo();
          return;
        }

        const token = String(active.play_token || `${active.id}-${active.started_at}`);
        if (token !== currentToken) {
          await beginVideo(active);
        }
      } catch (error) {
        console.warn("Media display check failed.", error);
      } finally {
        checking = false;
      }
    }

    injectDisplayUi();
    setInterval(checkDisplayVideo, 1500);
    window.addEventListener("storage", event => {
      if (!configured && event.key === DEMO_STATE_KEY) checkDisplayVideo();
    });
    window.addEventListener(DEMO_EVENT, checkDisplayVideo);

    if (configured) {
      client.channel("draft-video-display")
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "draft_settings"
        }, checkDisplayVideo)
        .subscribe();
    }

    const displayObserver = new MutationObserver(checkDisplayVideo);
    displayObserver.observe($("displayApp"), {
      attributes: true,
      attributeFilter: ["class"]
    });
    checkDisplayVideo();
  }
})();
