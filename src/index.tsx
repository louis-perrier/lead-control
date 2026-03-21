import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { BrowserRouter } from "react-router-dom";
import {
  CssBaseline,
  ThemeProvider,
  createTheme,
  StyledEngineProvider,
} from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./global.css";

import "./global.css";
import { AuthProvider } from "./context/AuthContext";

// Configuration du SDK Facebook pour WhatsApp Embedded Signup
declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: any;
  }
}

window.fbAsyncInit = function() {
  if (typeof window.FB !== 'undefined' && import.meta.env.VITE_META_APP_ID) {
    try {
      window.FB.init({
        appId: import.meta.env.VITE_META_APP_ID,
        autoLogAppEvents: true,
        xfbml: true,
        version: 'v21.0'
      });
      console.log("✅ Facebook SDK initialized");
    } catch (error) {
      console.error("❌ Facebook SDK init failed:", error);
    }
  } else {
    console.warn("⚠️ Facebook SDK not initialized: missing VITE_META_APP_ID or FB not loaded");
  }
};

const muiTheme = createTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    },
  },
});

const container = document.getElementById("root");

const root = createRoot(container as Element);
root.render(
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StyledEngineProvider injectFirst>
          <ThemeProvider theme={muiTheme}>
            <CssBaseline />
            <App />
          </ThemeProvider>
        </StyledEngineProvider>
      </AuthProvider>
    </QueryClientProvider>
  </BrowserRouter>,
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
