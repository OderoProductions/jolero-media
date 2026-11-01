/* Jolero client gallery: adding files from the Edit tab.

   Loaded with gallery-admin.js, for portal admins only. It does what the
   portal's New gallery form does, for files added to a gallery that
   already exists:
     · photos get a 900px thumbnail and a 2048px preview, made in this
       browser from the original (turned upright, camera data dropped)
     · videos the browser can play are their own preview (v/ keys), with a
       poster frame grabbed here; anything it can't open goes up as a
       plain download
     · each original's CRC-32 is worked out here, so Download all can
       include it with no zip to rebuild
     · files go straight to R2 through the worker, in 50 MB pieces, three
       at a time, retrying dropped connections.
   Same manifest item format as the portal and the jolero-gallery Mac tool. */
(() => {
  "use strict";

  const PART = 50 * 1024 * 1024;
  const PHOTO = /\.(jpe?g|png|webp|gif|heic|heif|tiff?|dng|cr2|cr3|nef|arw|raf|orf|rw2)$/i;
  const VIDEO = /\.(mp4|mov|m4v|webm|mxf|avi|mkv|mts|m2ts)$/i;
  const TYPES = { heic: "image/heic", heif: "image/heif", mov: "video/quicktime", mxf: "application/mxf",
                  mts: "video/mp2t", m2ts: "video/mp2t", dng: "image/x-adobe-dng" };

  const kind = (name) => (VIDEO.test(name) ? "video" : PHOTO.test(name) ? "photo" : "file");
  const ext = (name) => ((/\.([a-z0-9]{1,10})$/i.exec(name) || [])[1] || "").toLowerCase();
  const pad4 = (n) => String(n).padStart(4, "0");
  const slug = (s) => (String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "")) || "file";
  const contentType = (file) => file.type || TYPES[ext(file.name)] || "application/octet-stream";

  /* ---------- previews ---------- */

  function toJpeg(source, width, height, edge, quality) {
    const s = Math.min(1, edge / Math.max(width, height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(width * s));
    c.height = Math.max(1, Math.round(height * s));
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, c.width, c.height);
    return new Promise((resolve, reject) => {
      c.toBlob((b) => (b ? resolve({ blob: b, canvas: c }) : reject(new Error("Couldn't make a preview"))), "image/jpeg", quality);
    });
  }

  async function photoPreviews(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e) { return null; } // a format this browser can't open: it goes up as a download
    try {
      const preview = await toJpeg(bmp, bmp.width, bmp.height, 2048, 0.82);
      const thumb = await toJpeg(preview.canvas, preview.canvas.width, preview.canvas.height, 900, 0.74);
      return { w: bmp.width, h: bmp.height, preview: preview.blob, thumb: thumb.blob };
    } catch (e) {
      return null;
    } finally {
      bmp.close();
    }
  }

  function videoPreview(file) {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      const src = URL.createObjectURL(file);
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        v.removeAttribute("src");
        v.load();
        URL.revokeObjectURL(src);
        resolve(result);
      };
      const timer = setTimeout(() => finish(null), 20000);
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.onerror = () => finish(null);
      v.onloadedmetadata = () => {
        if (!v.videoWidth || !isFinite(v.duration)) return finish(null);
        v.currentTime = Math.min(2, v.duration * 0.1);
      };
      v.onseeked = async () => {
        try {
          const poster = await toJpeg(v, v.videoWidth, v.videoHeight, 1280, 0.8);
          finish({ w: v.videoWidth, h: v.videoHeight, dur: Math.round(v.duration * 100) / 100, poster: poster.blob });
        } catch (e) { finish(null); }
      };
      v.src = src;
    });
  }

  /* ---------- CRC-32, for Download all ---------- */

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  async function fileCrc(file) {
    const reader = file.stream().getReader();
    let crc = 0xFFFFFFFF;
    for (;;) {
      const step = await reader.read();
      if (step.done) return (crc ^ 0xFFFFFFFF) >>> 0;
      const b = step.value;
      for (let i = 0; i < b.length; i++) crc = CRC_TABLE[(crc ^ b[i]) & 0xFF] ^ (crc >>> 8);
    }
  }

  /* One file -> its manifest item and the blobs to upload. n is its number
     in the gallery, which names its keys (o/0005-name.jpg, t/0005.jpg). */
  async function prepare(file, n) {
    const k = kind(file.name);
    const e = ext(file.name);
    const orig = `o/${pad4(n)}-${slug(file.name.replace(/\.[^.]+$/, ""))}${e ? "." + e : ""}`;
    const item = { type: k, name: file.name, bytes: file.size, o: orig };
    const uploads = [];
    if (k === "photo") {
      const p = await photoPreviews(file);
      if (p) {
        Object.assign(item, { w: p.w, h: p.h, t: `t/${pad4(n)}.jpg`, p: `p/${pad4(n)}.jpg` });
        uploads.push({ key: item.t, blob: p.thumb, type: "image/jpeg" });
        uploads.push({ key: item.p, blob: p.preview, type: "image/jpeg" });
      } else {
        item.type = "file";
      }
    } else if (k === "video") {
      const v = await videoPreview(file);
      if (v) {
        // the original doubles as the preview: v/ keys stay playable when a gallery is locked
        item.o = "v/" + orig.slice(2);
        item.p = item.o;
        Object.assign(item, { w: v.w, h: v.h, dur: v.dur, t: `t/${pad4(n)}.jpg` });
        uploads.push({ key: item.t, blob: v.poster, type: "image/jpeg" });
      } else {
        item.type = "file";
      }
    }
    item.crc = await fileCrc(file);
    uploads.push({ key: item.o, blob: file, type: contentType(file), meta: { filename: file.name } });
    return { item, uploads };
  }

  /* ---------- sending ---------- */

  // XHR rather than fetch, because only XHR reports upload progress
  function sender(api, getToken) {
    async function send(method, path, body, headers, onBytes) {
      let bearer = await getToken();
      let last;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          return await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            let sent = 0;
            xhr.open(method, api + path);
            xhr.setRequestHeader("authorization", `Bearer ${bearer}`);
            for (const [k, v] of Object.entries(headers || {})) xhr.setRequestHeader(k, v);
            xhr.upload.onprogress = (e) => { if (onBytes) { onBytes(e.loaded - sent); sent = e.loaded; } };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.responseText ? JSON.parse(xhr.responseText) : null);
              if (onBytes) onBytes(-sent);
              const err = new Error(`Upload failed (${xhr.status})`);
              err.status = xhr.status;
              reject(err);
            };
            xhr.onerror = () => { if (onBytes) onBytes(-sent); reject(new Error("The connection dropped")); };
            xhr.send(body);
          });
        } catch (err) {
          last = err;
          if (err.status === 401) throw new Error("The gallery service didn't accept your sign-in. Sign out of the portal and back in, then retry.");
          if (err.status && err.status < 500 && err.status !== 429) throw err;
          await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
          bearer = await getToken();
        }
      }
      throw last;
    }

    const metaHeaders = (meta) => Object.fromEntries(Object.entries(meta || {})
      .map(([k, v]) => [`x-meta-${k}`, encodeURIComponent(String(v))]));

    async function putBig(key, blob, type, meta, onBytes) {
      const path = `/admin/mpu/${encodeURI(key)}`;
      const created = await send("POST", `${path}?action=create`, "",
        { "content-type": type || "application/octet-stream", ...metaHeaders(meta) });
      const uid = encodeURIComponent(created.uploadId);
      const count = Math.ceil(blob.size / PART);
      const parts = new Array(count);
      let next = 0;
      try {
        await Promise.all([0, 1, 2].map(async () => {
          while (next < count) {
            const i = next++;
            const r = await send("PUT", `${path}?uploadId=${uid}&part=${i + 1}`,
              blob.slice(i * PART, Math.min((i + 1) * PART, blob.size)), {}, onBytes);
            parts[i] = { partNumber: r.partNumber, etag: r.etag };
          }
        }));
        await send("POST", `${path}?action=complete&uploadId=${uid}`, JSON.stringify({ parts }),
          { "content-type": "application/json" });
      } catch (err) {
        try { await send("DELETE", `${path}?uploadId=${uid}`, null, {}); } catch (e) { /* best effort */ }
        throw err;
      }
    }

    return async function put(key, blob, type, meta, onBytes) {
      if (blob.size > PART) return putBig(key, blob, type, meta, onBytes);
      await send("PUT", `/admin/o/${encodeURI(key)}`, blob,
        { "content-type": type || "application/octet-stream", ...metaHeaders(meta) }, onBytes);
    };
  }

  /* Prepare and upload files into gallery gid, numbering from `start`.
     progress(text, fraction) is called as it goes; written(key) for every
     object that reaches R2, so a cancelled edit can clean up after itself.
     Returns the new manifest items, in the order given. */
  async function upload({ api, getToken, gid, files, start, progress, written }) {
    const put = sender(api, getToken);
    const items = [];
    const uploads = [];
    for (let i = 0; i < files.length; i++) {
      progress(`Preparing ${i + 1} of ${files.length}: ${files[i].name}`, 0);
      const out = await prepare(files[i], start + i);
      items.push(out.item);
      uploads.push(...out.uploads);
    }
    // previews first, so a cut-off upload leaves little behind
    uploads.sort((a, b) => /^[ov]\//.test(a.key) - /^[ov]\//.test(b.key));
    const total = uploads.reduce((s, u) => s + u.blob.size, 0) || 1;
    let done = 0;
    const onBytes = (d) => { done += d; progress(`Uploading ${Math.round((done / total) * 100)}%`, done / total); };
    let next = 0;
    await Promise.all([0, 1, 2].map(async () => {
      while (next < uploads.length) {
        const u = uploads[next++];
        const key = `g/${gid}/${u.key}`;
        await put(key, u.blob, u.type, u.meta, onBytes);
        written(u.key);
      }
    }));
    return items;
  }

  window.JoleroUpload = { upload, kind };
})();
