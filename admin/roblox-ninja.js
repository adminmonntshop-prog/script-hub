
/*
 * admin/roblox-ninja.js
 *
 * ใช้ Supabase client ที่ระบบเดิมสร้างไว้
 * เรียก initNinjaFileManager({
 *   supabase: supabaseClient,
 *   root: document.querySelector("#ninja-file-manager"),
 *   isAdmin: true // ต้องมาจากการตรวจสิทธิ์จริงของระบบเดิม
 * })
 */

export function initNinjaFileManager({ supabase, root, isAdmin }) {
  if (!root) throw new Error("ไม่พบพื้นที่แสดงตัวจัดการไฟล์");
  if (!supabase) throw new Error("ไม่พบ Supabase client");

  if (isAdmin !== true) {
    root.textContent = "คุณไม่มีสิทธิ์จัดการไฟล์นี้";
    return;
  }

  const BUCKET = "roblox-ninja";
  const MAX_BYTES = 100 * 1024 * 1024; // 100 MB
  let draftPath = null;
  let busy = false;

  root.innerHTML = `
    <section class="ninja-manager">
      <h2>จัดการไฟล์ Roblox นินจา</h2>
      <p>เลือกไฟล์ใหม่ก่อน แล้วกดบันทึกเพื่อเผยแพร่</p>

      <label for="ninja-file">ไฟล์ที่ต้องการอัปโหลด</label>
      <input id="ninja-file" type="file" />

      <p id="ninja-file-info">ยังไม่ได้เลือกไฟล์</p>

      <div class="ninja-actions">
        <button id="ninja-upload" type="button">อัปโหลดไฟล์ร่าง</button>
        <button id="ninja-save" type="button" disabled>
          บันทึกการเปลี่ยนแปลง
        </button>
        <button id="ninja-cancel" type="button" disabled>
          ยกเลิกไฟล์ร่าง
        </button>
      </div>

      <p id="ninja-message" role="status" aria-live="polite"></p>
    </section>
  `;

  const $ = (selector) => root.querySelector(selector);
  const fileInput = $("#ninja-file");
  const info = $("#ninja-file-info");
  const message = $("#ninja-message");
  const uploadButton = $("#ninja-upload");
  const saveButton = $("#ninja-save");
  const cancelButton = $("#ninja-cancel");

  function setBusy(value) {
    busy = value;
    uploadButton.disabled = value;
    saveButton.disabled = value || !draftPath;
    cancelButton.disabled = value || !draftPath;
    fileInput.disabled = value;
  }

  function show(text, error = false) {
    message.textContent = text;
    message.style.color = error ? "#b42318" : "inherit";
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];

    if (!file) {
      info.textContent = "ยังไม่ได้เลือกไฟล์";
      return;
    }

    if (file.size > MAX_BYTES) {
      fileInput.value = "";
      info.textContent = "ยังไม่ได้เลือกไฟล์";
      show("ไฟล์ใหญ่เกิน 100 MB กรุณาเลือกไฟล์ที่เล็กกว่านี้", true);
      return;
    }

    info.textContent =
      `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
    show("เลือกไฟล์แล้ว ขั้นต่อไปให้อัปโหลดเป็นไฟล์ร่าง");
  });

  uploadButton.addEventListener("click", async () => {
    if (busy) return;

    const file = fileInput.files?.[0];
    if (!file) {
      show("กรุณาเลือกไฟล์ก่อน", true);
      return;
    }

    if (file.size > MAX_BYTES) {
      show("ไฟล์ใหญ่เกิน 100 MB", true);
      return;
    }

    setBusy(true);

    try {
      const { data: { user }, error: userError } =
        await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("กรุณาเข้าสู่ระบบแอดมินใหม่");
      }

      // สุ่มชื่อไฟล์ร่าง เพื่อไม่เขียนทับไฟล์ที่เผยแพร่อยู่
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `drafts/${user.id}/${crypto.randomUUID()}-${safeName}`;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream"
        });

      if (error) throw error;

      // ไฟล์นี้ยังเป็นไฟล์ร่าง ไม่ได้เปลี่ยนไฟล์ที่ผู้ใช้ดาวน์โหลด
      draftPath = path;
      saveButton.disabled = false;
      cancelButton.disabled = false;
      show("อัปโหลดไฟล์ร่างสำเร็จ ไฟล์เดิมยังใช้งานอยู่");
    } catch (error) {
      show(error.message || "อัปโหลดไม่สำเร็จ", true);
    } finally {
      setBusy(false);
    }
  });

  saveButton.addEventListener("click", async () => {
    if (busy || !draftPath) return;

    if (!confirm("ยืนยันบันทึกและเผยแพร่ไฟล์ใหม่นี้หรือไม่?")) return;

    setBusy(true);

    try {
      /*
       * RPC นี้ต้องสร้างใน Supabase ก่อน
       * ต้องตรวจสิทธิ์แอดมินฝั่งฐานข้อมูล และสลับไฟล์ที่เผยแพร่
       * หลังจากยืนยันว่าไฟล์ร่างมีอยู่จริงเท่านั้น
       */
      const { error } = await supabase.rpc("publish_ninja_file", {
        p_draft_path: draftPath
      });

      if (error) throw error;

      draftPath = null;
      fileInput.value = "";
      info.textContent = "บันทึกไฟล์ใหม่เรียบร้อยแล้ว";
      show("เผยแพร่ไฟล์ใหม่สำเร็จ");
    } catch (error) {
      show(
        "บันทึกไม่สำเร็จ ไฟล์เดิมควรยังใช้งานอยู่: " +
          (error.message || "เกิดข้อผิดพลาด"),
        true
      );
    } finally {
      setBusy(false);
    }
  });

  cancelButton.addEventListener("click", async () => {
    if (busy || !draftPath) return;

    if (!confirm("ยกเลิกไฟล์ร่างนี้หรือไม่?")) return;

    setBusy(true);

    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .remove([draftPath]);

      if (error) throw error;

      draftPath = null;
      fileInput.value = "";
      info.textContent = "ยกเลิกไฟล์ร่างแล้ว";
      show("ยกเลิกไฟล์ร่างสำเร็จ ไฟล์ที่เผยแพร่เดิมไม่เปลี่ยน");
    } catch (error) {
      show(error.message || "ยกเลิกไฟล์ร่างไม่สำเร็จ", true);
    } finally {
      setBusy(false);
    }
  });
}
