function usersPage() {
  return {
    users: [],
    loading: true,
    editing: null,
    creating: false,
    newUser: { name: "", email: "", password: "", passwordConfirm: "", role: "salesperson" },

    async init() {
      await this.load();
    },

    async load() {
      this.loading = true;
      try {
        this.users = await api.getUsers();
      } catch (e) {
        console.error("Load users error:", e);
      } finally {
        this.loading = false;
      }
    },

    startCreate() {
      this.creating = true;
      this.newUser = { name: "", email: "", password: "", passwordConfirm: "", role: "salesperson" };
    },

    cancelCreate() {
      this.creating = false;
    },

    async saveNewUser() {
      if (!this.newUser.email || !this.newUser.password) return alert("Email and password required");
      if (this.newUser.password !== this.newUser.passwordConfirm) return alert("Passwords don't match");
      try {
        await api.createUser(this.newUser);
        this.creating = false;
        await this.load();
      } catch (e) {
        console.error("Create user error:", e);
        alert("Failed: " + e.message);
      }
    },

    editRole(u) {
      this.editing = { id: u.id, name: u.name, role: u.role };
    },

    cancelEdit() {
      this.editing = null;
    },

    async saveRole() {
      try {
        await api.updateUser(this.editing.id, { role: this.editing.role });
        this.editing = null;
        await this.load();
      } catch (e) {
        console.error("Update user error:", e);
        alert("Failed: " + e.message);
      }
    },

    roleColor(role) {
      return { admin: "bg-red-100 text-red-600", manager: "bg-blue-100 text-blue-600", salesperson: "bg-green-100 text-green-600", viewer: "bg-gray-100 text-gray-600" }[role] || "bg-gray-100 text-gray-600";
    },
  };
}
window.usersPage = usersPage;
