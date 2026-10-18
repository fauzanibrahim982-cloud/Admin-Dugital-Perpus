
/* =====================================================
   DIGITAL PERPUS — ADMIN PANEL
   File: script.js

   Menggunakan Supabase project Digital Perpus.
   JANGAN masukkan service_role key ke frontend.
   ===================================================== */

/* ---------- 1. KONFIGURASI SUPABASE ---------- */

const SUPABASE_URL =
  "https://ppsgonkgibvlvlnvsmrp.supabase.co";

// Gunakan publishable key milik project kamu.
// Jangan pernah menggunakan service_role key di sini.
const SUPABASE_KEY =
  "sb_publishable_aE-dagEXDuxWb7FFHYkK5Q_qCyBlomq";

const TABLES = {
  admins: "admin_users",
  books: "books",
  members: "profiles",
  purchases: "purchases",
  settings: "site_settings",
};

const STORAGE = {
  banners: "dp-assets",
};

// Nama kolom yang umum digunakan pada database Digital Perpus.
// Sesuaikan bagian ini apabila nama kolom di Supabase berbeda.
const COLUMNS = {
  adminUserId: "user_id",
  profileId: "id",
  bookId: "id",
  purchaseId: "id",
  bookStatus: "status",
  bookTitle: "title",
  bookAuthor: "author",
  profileName: "full_name",
  purchaseStatus: "status",
};

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

/* ---------- 2. STATE APLIKASI ---------- */

let currentUser = null;
let booksCache = [];
let membersCache = [];
let purchasesCache = [];
let currentBookFilter = "all";
let activeTab = "books";

/* ---------- 3. HELPER DOM ---------- */

const $ = (selector) => document.querySelector(selector);

const $$ = (selector) =>
  Array.from(document.querySelectorAll(selector));

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value ?? "";
}

function showElement(id) {
  document.getElementById(id)?.classList.remove("hidden");
}

function hideElement(id) {
  document.getElementById(id)?.classList.add("hidden");
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID").format(
    Number(value) || 0
  );
}

function getValue(object, keys, fallback = "-") {
  for (const key of keys) {
    if (
      object &&
      object[key] !== undefined &&
      object[key] !== null &&
      object[key] !== ""
    ) {
      return object[key];
    }
  }

  return fallback;
}

function showToast(message, type = "success") {
  const toast = $("#toast");

  if (!toast) {
    console.log(message);
    return;
  }

  toast.textContent = message;
  toast.classList.remove("hidden", "success", "error");
  toast.classList.add(type === "error" ? "error" : "success");

  // Tidak memakai timer otomatis agar tidak bergantung pada
  // elemen atau animasi tertentu. Klik toast untuk menutupnya.
}

function showMessage(id, message, type = "error") {
  const element = document.getElementById(id);
  if (!element) return;

  element.textContent = message;
  element.classList.remove("hidden", "success", "error", "warning");
  element.classList.add(type);
}

function clearMessage(id) {
  const element = document.getElementById(id);
  if (!element) return;

  element.textContent = "";
  element.classList.add("hidden");
  element.classList.remove("success", "error", "warning");
}

function getErrorMessage(error) {
  if (!error) return "Terjadi kesalahan yang tidak diketahui.";

  const message = error.message || String(error);

  if (/row.level security|permission denied|not allowed/i.test(message)) {
    return (
      "Akses database ditolak. Periksa kebijakan RLS Supabase " +
      "dan izin akun admin."
    );
  }

  return message;
}

/* ---------- 4. NAVIGASI HALAMAN ---------- */

function showLogin() {
  showElement("loginView");
  hideElement("deniedView");
  hideElement("dashboardView");
}

function showDenied(message) {
  hideElement("loginView");
  hideElement("dashboardView");
  showElement("deniedView");

  setText(
    "deniedMessage",
    message || "Akun ini tidak memiliki akses administrator."
  );
}

function showDashboard() {
  hideElement("loginView");
  hideElement("deniedView");
  showElement("dashboardView");

  setText(
    "signedInAs",
    currentUser?.email || "Administrator"
  );
}

function activateTab(tabName) {
  const allowedTabs = ["books", "members", "purchases", "banner"];

  if (!allowedTabs.includes(tabName)) return;

  activeTab = tabName;

  $$("[data-tab]").forEach((button) => {
    const selected = button.dataset.tab === tabName;

    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });

  allowedTabs.forEach((name) => {
    const section = document.getElementById(`tab-${name}`);

    if (section) {
      section.classList.toggle("hidden", name !== tabName);
    }
  });
}

/* ---------- 5. AUTENTIKASI ---------- */

async function checkAdmin(user) {
  if (!user?.id) return false;

  const { data, error } = await supabaseClient
    .from(TABLES.admins)
    .select(COLUMNS.adminUserId)
    .eq(COLUMNS.adminUserId, user.id)
    .maybeSingle();

  if (error) {
    console.error("Pengecekan admin gagal:", error);
    throw error;
  }

  return Boolean(data);
}

async function handleLogin(event) {
  event.preventDefault();

  const email = $("#email")?.value.trim();
  const password = $("#password")?.value;
  const loginButton = $("#loginBtn");

  clearMessage("loginMessage");

  if (!email || !password) {
    showMessage(
      "loginMessage",
      "Masukkan email dan password terlebih dahulu.",
      "error"
    );
    return;
  }

  if (loginButton) {
    loginButton.disabled = true;
    loginButton.textContent = "Memeriksa akun...";
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    currentUser = data.user;

    const isAdmin = await checkAdmin(currentUser);

    if (!isAdmin) {
      await supabaseClient.auth.signOut();
      currentUser = null;

      showDenied(
        "Login berhasil, tetapi akun ini belum terdaftar sebagai admin."
      );
      return;
    }

    showDashboard();
    activateTab("books");

    await loadDashboard();
    showToast("Berhasil masuk ke Admin Digital Perpus.");
  } catch (error) {
    console.error(error);

    showMessage(
      "loginMessage",
      getErrorMessage(error),
      "error"
    );

    await supabaseClient.auth.signOut().catch(() => {});
    currentUser = null;
    showLogin();
  } finally {
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.textContent = "Masuk";
    }
  }
}

async function handleLogout() {
  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) throw error;

    currentUser = null;
    booksCache = [];
    membersCache = [];
    purchasesCache = [];

    showLogin();
    showToast("Kamu sudah keluar dari panel admin.");
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error), "error");
  }
}

async function restoreSession() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    const user = data.session?.user;

    if (!user) {
      currentUser = null;
      showLogin();
      return;
    }

    currentUser = user;

    const isAdmin = await checkAdmin(user);

    if (!isAdmin) {
      await supabaseClient.auth.signOut();
      currentUser = null;

      showDenied(
        "Akun yang sedang login tidak terdaftar sebagai administrator."
      );
      return;
    }

    showDashboard();
    activateTab("books");
    await loadDashboard();
  } catch (error) {
    console.error("Pemulihan sesi gagal:", error);
    showLogin();
  }
}

/* ---------- 6. PEMBACAAN DATA ---------- */

async function fetchAllRows(tableName) {
  const pageSize = 500;
  let allRows = [];
  let start = 0;

  while (true) {
    const { data, error } = await supabaseClient
      .from(tableName)
      .select("*")
      .range(start, start + pageSize - 1);

    if (error) throw error;

    const rows = data || [];
    allRows = allRows.concat(rows);

    if (rows.length < pageSize) break;

    start += pageSize;
  }

  return allRows;
}

async function loadDashboard() {
  if (!currentUser) return;

  try {
    const [books, members, purchases] = await Promise.all([
      fetchAllRows(TABLES.books),
      fetchAllRows(TABLES.members),
      fetchAllRows(TABLES.purchases),
    ]);

    booksCache = books;
    membersCache = members;
    purchasesCache = purchases;

    updateStatistics();
    renderBooks();
    renderMembers();
    renderPurchases();
  } catch (error) {
    console.error("Gagal memuat dashboard:", error);

    showToast(
      "Sebagian data gagal dimuat: " + getErrorMessage(error),
      "error"
    );
  }
}

function updateStatistics() {
  const pending = booksCache.filter((book) => {
    const status = String(
      getValue(book, [COLUMNS.bookStatus], "")
    ).toLowerCase();

    return ["pending", "menunggu", "review", "draft"].includes(status);
  });

  setText("bookCount", formatNumber(booksCache.length));
  setText("pendingCount", formatNumber(pending.length));
  setText("memberCount", formatNumber(membersCache.length));
  setText("purchaseCount", formatNumber(purchasesCache.length));
}

/* ---------- 7. TABEL BUKU ---------- */

function renderBooks() {
  const tbody = $("#booksTable");
  if (!tbody) return;

  const search = ($("#bookSearch")?.value || "").toLowerCase().trim();
  const filter = $("#bookStatusFilter")?.value || currentBookFilter;

  const filtered = booksCache.filter((book) => {
    const title = String(
      getValue(book, ["title", "name", "judul"], "")
    ).toLowerCase();

    const author = String(
      getValue(book, ["author", "author_name", "penulis"], "")
    ).toLowerCase();

    const status = String(
      getValue(book, ["status"], "")
    ).toLowerCase();

    const matchesSearch =
      title.includes(search) || author.includes(search);

    const matchesFilter =
      filter === "all" ||
      filter === "" ||
      status === filter.toLowerCase();

    return matchesSearch && matchesFilter;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="table-empty">
          Belum ada buku yang cocok dengan pencarian.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((book) => {
    const id = getValue(book, ["id", "book_id"], "");
    const title = getValue(book, ["title", "name", "judul"]);
    const author = getValue(book, [
      "author",
      "author_name",
      "penulis",
    ]);

    const status = String(
      getValue(book, ["status"], "unknown")
    );

    const date = getValue(book, [
      "created_at",
      "uploaded_at",
      "createdAt",
    ]);

    const normalizedStatus = status.toLowerCase();

    let badgeClass = "badge";
    if (["approved", "published", "active"].includes(normalizedStatus)) {
      badgeClass += " badge-success";
    } else if (
      ["pending", "menunggu", "draft", "review"].includes(normalizedStatus)
    ) {
      badgeClass += " badge-warning";
    } else if (
      ["rejected", "rejected", "inactive"].includes(normalizedStatus)
    ) {
      badgeClass += " badge-danger";
    }

    const actionButtons = [
      `<button class="btn btn-secondary" data-book-action="view" data-id="${escapeHTML(id)}">Detail</button>`,
      `<button class="btn" data-book-action="approve" data-id="${escapeHTML(id)}">Setujui</button>`,
      `<button class="btn btn-danger" data-book-action="delete" data-id="${escapeHTML(id)}">Hapus</button>`,
    ].join("");

    return `
      <tr>
        <td>${escapeHTML(id)}</td>
        <td>${escapeHTML(title)}</td>
        <td>${escapeHTML(author)}</td>
        <td><span class="${badgeClass}">${escapeHTML(status)}</span></td>
        <td>${escapeHTML(formatDate(date))}</td>
        <td><div class="table-actions">${actionButtons}</div></td>
      </tr>
    `;
  }).join("");
}

async function updateBookStatus(bookId, newStatus) {
  if (!bookId) throw new Error("ID buku tidak ditemukan.");

  const { error } = await supabaseClient
    .from(TABLES.books)
    .update({ [COLUMNS.bookStatus]: newStatus })
    .eq(COLUMNS.bookId, bookId);

  if (error) throw error;

  await loadDashboard();
}

async function deleteBook(bookId) {
  if (!bookId) throw new Error("ID buku tidak ditemukan.");

  const confirmed = window.confirm(
    "Yakin ingin menghapus data buku ini? Tindakan ini tidak dapat dibatalkan."
  );

  if (!confirmed) return;

  const { error } = await supabaseClient
    .from(TABLES.books)
    .delete()
    .eq(COLUMNS.bookId, bookId);

  if (error) throw error;

  showToast("Data buku berhasil dihapus.");
  await loadDashboard();
}

function viewBook(bookId) {
  const book = booksCache.find(
    (item) => String(item.id ?? item.book_id) === String(bookId)
  );

  if (!book) {
    showToast("Data buku tidak ditemukan.", "error");
    return;
  }

  const details = Object.entries(book)
    .map(([key, value]) => `${key}: ${value ?? "-"}`)
    .join("\n");

  window.alert(details);
}

async function handleBookAction(event) {
  const button = event.target.closest("[data-book-action]");
  if (!button) return;

  const action = button.dataset.bookAction;
  const id = button.dataset.id;

  try {
    button.disabled = true;

    if (action === "view") {
      viewBook(id);
    } else if (action === "approve") {
      const confirmed = window.confirm(
        "Setujui buku ini? Status akan diubah menjadi approved."
      );

      if (confirmed) {
        await updateBookStatus(id, "approved");
        showToast("Status buku berhasil diperbarui.");
      }
    } else if (action === "delete") {
      await deleteBook(id);
    }
  } catch (error) {
    console.error(error);
    showToast(getErrorMessage(error), "error");
  } finally {
    button.disabled = false;
  }
}

/* ---------- 8. TABEL ANGGOTA ---------- */

function renderMembers() {
  const tbody = $("#membersTable");
  if (!tbody) return;

  const search = ($("#memberSearch")?.value || "").toLowerCase().trim();

  const filtered = membersCache.filter((member) => {
    const name = String(
      getValue(member, ["full_name", "name", "username"], "")
    ).toLowerCase();

    const email = String(
      getValue(member, ["email"], "")
    ).toLowerCase();

    return name.includes(search) || email.includes(search);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="table-empty">
          Data anggota tidak ditemukan.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((member) => {
    const id = getValue(member, ["id", "user_id"], "");
    const name = getValue(member, [
      "full_name",
      "name",
      "username",
    ]);

    const email = getValue(member, ["email"]);
    const created = getValue(member, [
      "created_at",
      "joined_at",
    ]);

    return `
      <tr>
        <td>${escapeHTML(id)}</td>
        <td>${escapeHTML(name)}</td>
        <td>${escapeHTML(email)}</td>
        <td>${escapeHTML(formatDate(created))}</td>
      </tr>
    `;
  }).join("");
}

/* ---------- 9. TABEL TRANSAKSI ---------- */

function renderPurchases() {
  const tbody = $("#purchasesTable");
  if (!tbody) return;

  if (purchasesCache.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="table-empty">
          Belum ada transaksi.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = purchasesCache.map((purchase) => {
    const id = getValue(purchase, ["id", "purchase_id"], "");
    const userId = getValue(purchase, [
      "user_id",
      "profile_id",
    ]);

    const bookId = getValue(purchase, ["book_id"]);
    const amount = getValue(purchase, [
      "amount",
      "price",
      "total",
    ], 0);

    const status = getValue(purchase, [
      "status",
      "payment_status",
    ]);

    const date = getValue(purchase, [
      "created_at",
      "purchased_at",
    ]);

    return `
      <tr>
        <td>${escapeHTML(id)}</td>
        <td>${escapeHTML(userId)}</td>
        <td>${escapeHTML(bookId)}</td>
        <td>${escapeHTML(formatNumber(amount))}</td>
        <td>${escapeHTML(status)}</td>
        <td>${escapeHTML(formatDate(date))}</td>
      </tr>
    `;
  }).join("");
}

/* ---------- 10. BANNER WEBSITE ---------- */

function previewBanner(file) {
  const preview = $("#bannerPreview");
  const empty = $("#bannerEmpty");

  if (!file || !preview) return;

  if (!file.type.startsWith("image/")) {
    showMessage(
      "bannerMessage",
      "Pilih file gambar yang valid.",
      "error"
    );
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showMessage(
      "bannerMessage",
      "Ukuran gambar maksimal 5 MB.",
      "error"
    );
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    preview.src = reader.result;
    preview.classList.remove("hidden");
    empty?.classList.add("hidden");
  };

  reader.onerror = () => {
    showMessage(
      "bannerMessage",
      "Gambar gagal dibaca.",
      "error"
    );
  };

  reader.readAsDataURL(file);
}

async function saveBanner(event) {
  event.preventDefault();

  const fileInput = $("#bannerFile");
  const file = fileInput?.files?.[0];

  clearMessage("bannerMessage");

  if (!file) {
    showMessage(
      "bannerMessage",
      "Pilih gambar banner terlebih dahulu.",
      "error"
    );
    return;
  }

  if (!file.type.startsWith("image/")) {
    showMessage(
      "bannerMessage",
      "File harus berupa gambar.",
      "error"
    );
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showMessage(
      "bannerMessage",
      "Ukuran gambar maksimal 5 MB.",
      "error"
    );
    return;
  }

  const saveButton = $("#saveBannerBtn");

  try {
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Mengunggah...";
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const filePath = `banners/banner-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabaseClient.storage
      .from(STORAGE.banners)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabaseClient.storage
      .from(STORAGE.banners)
      .getPublicUrl(filePath);

    const publicUrl = publicData?.publicUrl;

    if (!publicUrl) {
      throw new Error("URL banner tidak berhasil dibuat.");
    }

    /*
      Catatan:
      Kode ini mengunggah gambar ke bucket dp-assets.
      Agar banner otomatis tampil di website utama, URL tersebut
      juga harus disimpan ke site_settings menggunakan struktur
      kolom yang benar di database kamu.

      Nama kolom site_settings belum dikonfirmasi di sini,
      jadi kode ini tidak menebak lalu menulis ke database.
    */

    showMessage(
      "bannerMessage",
      "Gambar berhasil diunggah. URL banner: " + publicUrl +
      ". Simpan URL ini pada pengaturan banner website utama.",
      "success"
    );

    const preview = $("#bannerPreview");
    const empty = $("#bannerEmpty");

    if (preview) {
      preview.src = publicUrl;
      preview.classList.remove("hidden");
    }

    empty?.classList.add("hidden");

    showToast("Gambar berhasil diunggah ke dp-assets.");
  } catch (error) {
    console.error("Upload banner gagal:", error);

    showMessage(
      "bannerMessage",
      getErrorMessage(error),
      "error"
    );

    showToast("Upload banner gagal.", "error");
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "Simpan Banner";
    }
  }
}

/* ---------- 11. EVENT LISTENERS ---------- */

function setupEventListeners() {
  $("#loginForm")?.addEventListener("submit", handleLogin);

  $("#logoutBtn")?.addEventListener("click", handleLogout);
  $("#deniedLogoutBtn")?.addEventListener("click", handleLogout);

  $$("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.tab);
    });
  });

  $("#bookSearch")?.addEventListener("input", renderBooks);

  $("#bookStatusFilter")?.addEventListener("change", (event) => {
    currentBookFilter = event.target.value;
    renderBooks();
  });

  $("#memberSearch")?.addEventListener("input", renderMembers);

  $("#booksTable")?.addEventListener("click", handleBookAction);

  $("#refreshBooksBtn")?.addEventListener("click", async () => {
    try {
      await loadDashboard();
      showToast("Data buku diperbarui.");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  });

  $("#refreshMembersBtn")?.addEventListener("click", async () => {
    try {
      await loadDashboard();
      showToast("Data anggota diperbarui.");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  });

  $("#refreshPurchasesBtn")?.addEventListener("click", async () => {
    try {
      await loadDashboard();
      showToast("Data transaksi diperbarui.");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  });

  $("#bannerFile")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) previewBanner(file);
  });

  $("#bannerForm")?.addEventListener("submit", saveBanner);

  $("#toast")?.addEventListener("click", (event) => {
    event.currentTarget.classList.add("hidden");
  });

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      currentUser = null;
      showLogin();
    }

    if (event === "SIGNED_IN" && session?.user) {
      currentUser = session.user;
    }
  });
}

/* ---------- 12. MULAI APLIKASI ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  activateTab("books");
  await restoreSession();
});
