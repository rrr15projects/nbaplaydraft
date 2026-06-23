(() => {
  const { api, escapeHtml } = DraftApp;
  const $ = id => document.getElementById(id);
  let ownerPassword = "";
  let snapshot = null;
  let teamPasswords = [];

  function showMessage(text, type = "success") {
    const el = $("message");
    el.textContent = text;
    el.className = `message ${type === "error" ? "error" : ""}`;
    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => el.classList.add("hidden"), 4000);
  }

  function showLoginError(text) {
    $("loginMessage").textContent = text;
    $("loginMessage").classList.remove("hidden");
  }

  async function refresh() {
    snapshot = await api.getSnapshot();
    teamPasswords = await api.revealTeamPasswords(ownerPassword);
    renderTeams();
  }

  function renderTeams() {
    if (!teamPasswords.length) {
      $("teamPasswords").innerHTML = `<div class="empty">Add teams on the Commissioner page first.</div>`;
      return;
    }
    $("teamPasswords").innerHTML = teamPasswords.map(team => `
      <div class="password-team-row">
        <div class="list-name">🏀 ${escapeHtml(team.name)}</div>
        <input class="big-input" style="padding:12px 14px;font-size:18px" type="text" value="${escapeHtml(team.access_code || "")}" data-team-password="${team.id}">
        <button class="mini-button" data-save-team="${team.id}">Save</button>
      </div>
    `).join("");

    document.querySelectorAll("[data-save-team]").forEach(button => {
      button.onclick = async () => {
        const id = Number(button.dataset.saveTeam);
        const input = document.querySelector(`[data-team-password="${id}"]`);
        const value = input.value.trim();
        if (!value) return showMessage("Type a team password.", "error");
        try {
          await api.setTeamPassword(ownerPassword, id, value);
          showMessage("Team password saved.");
          await refresh();
        } catch (error) {
          showMessage(error.message || String(error), "error");
        }
      };
    });
  }

  async function login() {
    const value = $("ownerLogin").value.trim();
    if (!value) return showLoginError("Type the owner password.");
    try {
      const good = await api.validateOwnerPassword(value);
      if (!good) return showLoginError("Wrong owner password.");
      ownerPassword = value;
      sessionStorage.setItem("draft-owner-password", value);
      $("loginScreen").classList.add("hidden");
      $("passwordApp").classList.remove("hidden");
      $("newOwner").value = value;
      $("newCommissioner").value = "";
      $("newDisplay").value = "";
      await refresh();
    } catch (error) {
      showLoginError(error.message || String(error));
    }
  }

  $("ownerLoginButton").onclick = login;
  $("ownerLogin").addEventListener("keydown", event => { if (event.key === "Enter") login(); });

  $("saveMainPasswords").onclick = async () => {
    const owner = $("newOwner").value.trim();
    const commissioner = $("newCommissioner").value.trim();
    const display = $("newDisplay").value.trim();
    if (!owner && !commissioner && !display) return showMessage("Type at least one new password.", "error");
    try {
      await api.setMainPasswords(ownerPassword, { owner, commissioner, display });
      if (owner) ownerPassword = owner;
      sessionStorage.setItem("draft-owner-password", ownerPassword);
      sessionStorage.removeItem("draft-commissioner-password");
      sessionStorage.removeItem("draft-display-password");
      showMessage("All big passwords were saved.");
    } catch (error) {
      showMessage(error.message || String(error), "error");
    }
  };

  $("resetEverything").onclick = async () => {
    if (!confirm("Erase all players, teams, order, and picks?")) return;
    try {
      await api.resetEverything(ownerPassword);
      showMessage("The draft was erased. Passwords stayed saved.");
      await refresh();
    } catch (error) {
      showMessage(error.message || String(error), "error");
    }
  };

  if (api.configured) $("firstTimeNote").classList.add("hidden");
  const saved = sessionStorage.getItem("draft-owner-password");
  if (saved) {
    $("ownerLogin").value = saved;
    login();
  }
})();
