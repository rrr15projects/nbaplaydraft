(() => {
  const config = window.APP_CONFIG || {};
  const configured = Boolean(
    config.SUPABASE_URL && config.SUPABASE_ANON_KEY &&
    !config.SUPABASE_URL.includes("YOUR_") &&
    !config.SUPABASE_ANON_KEY.includes("YOUR_")
  );

  const client = configured
    ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY)
    : null;

  const DEMO_KEY = "super-simple-draft-v4";
  const DEFAULTS = { owner: "owner", commissioner: "commissioner", display: "display" };

  const nowIso = () => new Date().toISOString();
  const addSecondsIso = seconds => new Date(Date.now() + Number(seconds) * 1000).toISOString();
  const clone = value => JSON.parse(JSON.stringify(value));
  const nextId = items => Math.max(0, ...items.map(item => Number(item.id) || 0)) + 1;
  const randomCode = () => String(Math.floor(1000 + Math.random() * 9000));

  function defaultData() {
    return {
      secrets: { ...DEFAULTS },
      settings: {
        id: 1,
        draft_name: "Basketball Draft",
        status: "setup",
        current_pick_number: 1,
        timer_duration: 120,
        timer_end_at: null,
        timer_paused_remaining: null,
        display_message: "",
        display_message_on: false,
        updated_at: nowIso()
      },
      teams: [],
      players: [],
      picks: []
    };
  }

  function getDemo() {
    try {
      const saved = JSON.parse(localStorage.getItem(DEMO_KEY));
      if (saved?.settings && saved?.secrets) return saved;
    } catch (_) {}
    const data = defaultData();
    localStorage.setItem(DEMO_KEY, JSON.stringify(data));
    return data;
  }

  function saveDemo(data) {
    data.settings.updated_at = nowIso();
    localStorage.setItem(DEMO_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent("draft-demo-change"));
  }

  function requireSecret(value, expected, label) {
    if (String(value) !== String(expected)) throw new Error(`Wrong ${label} password.`);
  }

  function currentPickFrom(data) {
    return data.picks.find(p => Number(p.pick_number) === Number(data.settings.current_pick_number)) || null;
  }

  function advanceAfterPick(data) {
    const next = data.picks.find(p => Number(p.pick_number) > Number(data.settings.current_pick_number) && !p.player_id);
    if (next) {
      data.settings.current_pick_number = Number(next.pick_number);
      data.settings.status = "waiting";
    } else {
      data.settings.status = "complete";
    }
    data.settings.timer_end_at = null;
    data.settings.timer_paused_remaining = null;
  }

  function makeDemoPick(data, playerId, expectedTeamId = null) {
    if (data.settings.status !== "live") throw new Error("The commissioner must press START first.");
    const pick = currentPickFrom(data);
    if (!pick) throw new Error("There is no current pick.");
    if (expectedTeamId && Number(pick.team_id) !== Number(expectedTeamId)) throw new Error("It is not your turn yet.");
    const player = data.players.find(p => Number(p.id) === Number(playerId));
    if (!player || player.drafted) throw new Error("That player is not available.");
    player.drafted = true;
    pick.player_id = Number(playerId);
    pick.status = "selected";
    pick.selected_at = nowIso();
    advanceAfterPick(data);
  }

  async function rpc(name, args = {}) {
    const result = await client.rpc(name, args);
    if (result.error) throw result.error;
    return result.data;
  }

  async function getSnapshot() {
    if (!configured) {
      const data = clone(getDemo());
      delete data.secrets;
      data.teams = data.teams.map(({ access_code, ...team }) => team);
      return data;
    }
    const [settings, teams, players, picks] = await Promise.all([
      client.from("draft_settings").select("*").eq("id", 1).single(),
      client.from("teams").select("id,name,display_order").order("display_order"),
      client.from("players").select("*").order("id"),
      client.from("picks").select("*").order("pick_number")
    ]);
    for (const result of [settings, teams, players, picks]) if (result.error) throw result.error;
    return { settings: settings.data, teams: teams.data || [], players: players.data || [], picks: picks.data || [] };
  }

  const api = {
    configured,
    modeLabel: configured ? "Live mode" : "Demo mode",
    defaults: DEFAULTS,
    getSnapshot,

    async validateOwnerPassword(password) {
      if (configured) return Boolean(await rpc("validate_owner_password", { p_password: password }));
      return String(password) === String(getDemo().secrets.owner);
    },
    async validateCommissionerPassword(password) {
      if (configured) return Boolean(await rpc("validate_commissioner_password", { p_password: password }));
      return String(password) === String(getDemo().secrets.commissioner);
    },
    async validateDisplayPassword(password) {
      if (configured) return Boolean(await rpc("validate_display_password", { p_password: password }));
      return String(password) === String(getDemo().secrets.display);
    },
    async setMainPasswords(ownerPassword, values) {
      if (configured) return rpc("owner_set_passwords", {
        p_owner_password: ownerPassword,
        p_new_owner_password: values.owner,
        p_new_commissioner_password: values.commissioner,
        p_new_display_password: values.display
      });
      const data = getDemo();
      requireSecret(ownerPassword, data.secrets.owner, "owner");
      if (values.owner) data.secrets.owner = values.owner;
      if (values.commissioner) data.secrets.commissioner = values.commissioner;
      if (values.display) data.secrets.display = values.display;
      saveDemo(data);
    },
    async setTeamPassword(ownerPassword, teamId, newPassword) {
      if (configured) return rpc("owner_set_team_password", { p_owner_password: ownerPassword, p_team_id: teamId, p_new_password: newPassword });
      const data = getDemo();
      requireSecret(ownerPassword, data.secrets.owner, "owner");
      const team = data.teams.find(t => Number(t.id) === Number(teamId));
      if (!team) throw new Error("Team not found.");
      team.access_code = newPassword;
      saveDemo(data);
    },
    async revealTeamPasswords(ownerPassword) {
      if (configured) return rpc("owner_list_team_passwords", { p_owner_password: ownerPassword });
      const data = getDemo();
      requireSecret(ownerPassword, data.secrets.owner, "owner");
      return data.teams.map(t => ({ id: t.id, name: t.name, access_code: t.access_code }));
    },

    async addPlayer(password, name) {
      if (configured) return rpc("admin_add_player", { p_password: password, p_name: name });
      const data = getDemo();
      requireSecret(password, data.secrets.commissioner, "commissioner");
      data.players.push({ id: nextId(data.players), name, drafted: false });
      saveDemo(data);
    },
    async deletePlayer(password, playerId) {
      if (configured) return rpc("admin_delete_player", { p_password: password, p_player_id: playerId });
      const data = getDemo();
      requireSecret(password, data.secrets.commissioner, "commissioner");
      const player = data.players.find(p => Number(p.id) === Number(playerId));
      if (player?.drafted) throw new Error("Undo that pick first.");
      data.players = data.players.filter(p => Number(p.id) !== Number(playerId));
      saveDemo(data);
    },
    async addTeam(password, name) {
      if (configured) return rpc("admin_add_team", { p_password: password, p_name: name });
      const data = getDemo();
      requireSecret(password, data.secrets.commissioner, "commissioner");
      const code = randomCode();
      const id = nextId(data.teams);
      data.teams.push({ id, name, display_order: data.teams.length + 1, access_code: code });
      saveDemo(data);
      return { id, code };
    },
    async deleteTeam(password, teamId) {
      if (configured) return rpc("admin_delete_team", { p_password: password, p_team_id: teamId });
      const data = getDemo();
      requireSecret(password, data.secrets.commissioner, "commissioner");
      data.teams = data.teams.filter(t => Number(t.id) !== Number(teamId));
      data.teams.forEach((t, i) => t.display_order = i + 1);
      data.picks = [];
      data.settings.status = "setup";
      saveDemo(data);
    },
    async moveTeam(password, teamId, direction) {
      if (configured) return rpc("admin_move_team", { p_password: password, p_team_id: teamId, p_direction: direction });
      const data = getDemo();
      requireSecret(password, data.secrets.commissioner, "commissioner");
      data.teams.sort((a, b) => a.display_order - b.display_order);
      const i = data.teams.findIndex(t => Number(t.id) === Number(teamId));
      const j = direction === "up" ? i - 1 : i + 1;
      if (i >= 0 && j >= 0 && j < data.teams.length) [data.teams[i], data.teams[j]] = [data.teams[j], data.teams[i]];
      data.teams.forEach((t, index) => t.display_order = index + 1);
      data.picks = [];
      data.settings.status = "setup";
      saveDemo(data);
    },
    async generateOrder(password, rounds) {
      if (configured) return rpc("admin_generate_order", { p_password: password, p_rounds: rounds });
      const data = getDemo();
      requireSecret(password, data.secrets.commissioner, "commissioner");
      if (!data.players.length) throw new Error("Add at least one player.");
      if (!data.teams.length) throw new Error("Add at least one team.");
      data.picks = [];
      const ordered = [...data.teams].sort((a, b) => a.display_order - b.display_order);
      let number = 1;
      for (let round = 1; round <= Number(rounds); round++) {
        for (const team of ordered) {
          data.picks.push({ id: nextId(data.picks), round_number: round, pick_number: number++, team_id: team.id, player_id: null, status: "pending", selected_at: null });
        }
      }
      data.players.forEach(p => p.drafted = false);
      data.settings.current_pick_number = 1;
      data.settings.status = "waiting";
      data.settings.timer_end_at = null;
      data.settings.timer_paused_remaining = null;
      saveDemo(data);
    },
    async setTimerDuration(password, seconds) {
      if (configured) return rpc("admin_set_timer_duration", { p_password: password, p_seconds: seconds });
      const data = getDemo();
      requireSecret(password, data.secrets.commissioner, "commissioner");
      data.settings.timer_duration = Number(seconds);
      saveDemo(data);
    },
    async startPick(password) {
      if (configured) return rpc("admin_start_pick", { p_password: password });
      const data = getDemo();
      requireSecret(password, data.secrets.commissioner, "commissioner");
      if (!data.picks.length) throw new Error("Make the order first.");
      if (data.settings.status === "complete") throw new Error("The draft is finished.");
      data.settings.status = "live";
      data.settings.timer_end_at = addSecondsIso(data.settings.timer_duration);
      data.settings.timer_paused_remaining = null;
      saveDemo(data);
    },
    async pausePick(password) {
      if (configured) return rpc("admin_pause_pick", { p_password: password });
      const data = getDemo();
      requireSecret(password, data.secrets.commissioner, "commissioner");
      if (data.settings.status !== "live") return;
      data.settings.timer_paused_remaining = Math.max(0, Math.ceil((new Date(data.settings.timer_end_at) - Date.now()) / 1000));
      data.settings.timer_end_at = null;
      data.settings.status = "paused";
      saveDemo(data);
    },
    async resumePick(password) {
      if (configured) return rpc("admin_resume_pick", { p_password: password });
      const data = getDemo();
      requireSecret(password, data.secrets.commissioner, "commissioner");
      data.settings.status = "live";
      data.settings.timer_end_at = addSecondsIso(data.settings.timer_paused_remaining ?? data.settings.timer_duration);
      data.settings.timer_paused_remaining = null;
      saveDemo(data);
    },
    async resetTimer(password) {
      if (configured) return rpc("admin_reset_timer", { p_password: password });
      const data = getDemo();
      requireSecret(password, data.secrets.commissioner, "commissioner");
      if (data.settings.status === "live") data.settings.timer_end_at = addSecondsIso(data.settings.timer_duration);
      else data.settings.timer_paused_remaining = data.settings.timer_duration;
      saveDemo(data);
    },
    async makeAdminPick(password, playerId) {
      if (configured) return rpc("admin_make_pick", { p_password: password, p_player_id: playerId });
      const data = getDemo();
      requireSecret(password, data.secrets.commissioner, "commissioner");
      makeDemoPick(data, playerId);
      saveDemo(data);
    },
    async teamMakePick(teamId, teamPassword, playerId) {
      if (configured) return rpc("team_make_pick", { p_team_id: teamId, p_team_password: teamPassword, p_player_id: playerId });
      const data = getDemo();
      const team = data.teams.find(t => Number(t.id) === Number(teamId));
      if (!team) throw new Error("Team not found.");
      requireSecret(teamPassword, team.access_code, "team");
      makeDemoPick(data, playerId, teamId);
      saveDemo(data);
    },
    async validateTeamPassword(teamId, teamPassword) {
      if (configured) return Boolean(await rpc("validate_team_password", { p_team_id: teamId, p_team_password: teamPassword }));
      const team = getDemo().teams.find(t => Number(t.id) === Number(teamId));
      return Boolean(team && String(team.access_code) === String(teamPassword));
    },
    async undoLastPick(password) {
      if (configured) return rpc("admin_undo_last_pick", { p_password: password });
      const data = getDemo();
      requireSecret(password, data.secrets.commissioner, "commissioner");
      const last = [...data.picks].filter(p => p.player_id).sort((a, b) => Number(b.pick_number) - Number(a.pick_number))[0];
      if (!last) throw new Error("There is no pick to undo.");
      const player = data.players.find(p => Number(p.id) === Number(last.player_id));
      if (player) player.drafted = false;
      last.player_id = null;
      last.status = "pending";
      last.selected_at = null;
      data.settings.current_pick_number = last.pick_number;
      data.settings.status = "waiting";
      data.settings.timer_end_at = null;
      data.settings.timer_paused_remaining = null;
      saveDemo(data);
    },
    async setDisplayMessage(password, message) {
      if (configured) return rpc("admin_set_display_message", { p_password: password, p_message: message });
      const data = getDemo();
      requireSecret(password, data.secrets.commissioner, "commissioner");
      data.settings.display_message = message;
      data.settings.display_message_on = true;
      saveDemo(data);
    },
    async clearDisplayMessage(password) {
      if (configured) return rpc("admin_clear_display_message", { p_password: password });
      const data = getDemo();
      requireSecret(password, data.secrets.commissioner, "commissioner");
      data.settings.display_message = "";
      data.settings.display_message_on = false;
      saveDemo(data);
    },
    async resetEverything(ownerPassword) {
      if (configured) return rpc("owner_reset_everything", { p_owner_password: ownerPassword });
      const data = getDemo();
      requireSecret(ownerPassword, data.secrets.owner, "owner");
      const secrets = { ...data.secrets };
      const fresh = defaultData();
      fresh.secrets = secrets;
      saveDemo(fresh);
    },

    subscribe(callback) {
      if (!configured) {
        const handler = () => callback();
        window.addEventListener("storage", handler);
        window.addEventListener("draft-demo-change", handler);
        return () => {
          window.removeEventListener("storage", handler);
          window.removeEventListener("draft-demo-change", handler);
        };
      }
      let timer;
      const trigger = () => { clearTimeout(timer); timer = setTimeout(callback, 120); };
      const channel = client.channel("draft-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "draft_settings" }, trigger)
        .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, trigger)
        .on("postgres_changes", { event: "*", schema: "public", table: "players" }, trigger)
        .on("postgres_changes", { event: "*", schema: "public", table: "picks" }, trigger)
        .subscribe();
      return () => client.removeChannel(channel);
    }
  };

  window.DraftApp = {
    api,
    escapeHtml(value) {
      return String(value ?? "").replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
    },
    formatClock(totalSeconds) {
      const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
      return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    },
    secondsRemaining(settings) {
      if (!settings) return 0;
      if (settings.status === "paused") return Number(settings.timer_paused_remaining ?? settings.timer_duration ?? 0);
      if (!settings.timer_end_at) return Number(settings.timer_duration ?? 0);
      return Math.max(0, Math.ceil((new Date(settings.timer_end_at).getTime() - Date.now()) / 1000));
    },
    teamById(snapshot, id) { return snapshot.teams.find(t => Number(t.id) === Number(id)); },
    playerById(snapshot, id) { return snapshot.players.find(p => Number(p.id) === Number(id)); },
    currentPick(snapshot) { return snapshot.picks.find(p => Number(p.pick_number) === Number(snapshot.settings.current_pick_number)); }
  };
})();
