function loginPage() {
  return {
    email: "",
    password: "",
    error: "",
    submitting: false,

    async login() {
      this.error = "";
      this.submitting = true;
      try {
        await api.login(this.email, this.password);
        Alpine.store("auth").init();
        await Alpine.store("settings").load();
        window.location.hash = "#dashboard";
      } catch (e) {
        this.error = "Invalid email or password";
      } finally {
        this.submitting = false;
      }
    },
  };
}
window.loginPage = loginPage;
