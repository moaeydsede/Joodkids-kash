// روابط CSV المنشورة من Google Sheets + رابط API (Web App)
export const CONFIG = {
  APP_TITLE: "Cash & Wallet Manager VIP",
  CSV: {
    DASHBOARD: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRssV-EjmeIgbkKDHhZipxc3yiojVIrsmNzs64GTF3LDsht4HNQaTvxtG1Yvikj4ULFKWqJwQobJgQ9/pub?gid=746752754&single=true&output=csv",
    WALLETS:   "https://docs.google.com/spreadsheets/d/e/2PACX-1vRssV-EjmeIgbkKDHhZipxc3yiojVIrsmNzs64GTF3LDsht4HNQaTvxtG1Yvikj4ULFKWqJwQobJgQ9/pub?gid=1099804044&single=true&output=csv",
    // TXNS يمكن قراءته من CSV، لكن CRUD سيتم عبر API أدناه
    TXNS:      "https://docs.google.com/spreadsheets/d/e/2PACX-1vRssV-EjmeIgbkKDHhZipxc3yiojVIrsmNzs64GTF3LDsht4HNQaTvxtG1Yvikj4ULFKWqJwQobJgQ9/pub?gid=743977498&single=true&output=csv",
    USERS:     "https://docs.google.com/spreadsheets/d/e/2PACX-1vRssV-EjmeIgbkKDHhZipxc3yiojVIrsmNzs64GTF3LDsht4HNQaTvxtG1Yvikj4ULFKWqJwQobJgQ9/pub?gid=74589488&single=true&output=csv"
  },

  // ✅ ضع هنا رابط نشر Apps Script Web App (exec)
  // مثال: "https://script.google.com/macros/s/AKfycbxxxxxx/exec"
  API_BASE: "https://script.google.com/macros/s/AKfycbyg_mom-_5AJ4wDnKwgIFUCeG3YFBZv1ldt3XqECLr7QsuwiPn4KrdgsDq41x3kAEcsSw/exec",
  
  

  AUTH: { ENABLED: true },

  SESSION_KEY: "wm_session_v3",
};
