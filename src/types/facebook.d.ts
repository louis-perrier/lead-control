// Déclarations TypeScript pour le SDK Facebook utilisé par WhatsApp Embedded Signup

declare const FB: {
  init(params: {
    appId: string;
    autoLogAppEvents?: boolean;
    xfbml?: boolean;
    version: string;
  }): void;
  
  login(
    callback: (response: {
      authResponse?: {
        code?: string;
        access_token?: string;
        expires_in?: number;
      };
      status?: string;
      error?: any;
    }) => void,
    options?: {
      config_id?: string;
      response_type?: string;
      override_default_response_type?: boolean;
      extras?: {
        state?: string;
        setup?: any;
      };
    }
  ): void;
  
  logout(callback?: (response: any) => void): void;
  
  getLoginStatus(callback: (response: any) => void): void;
};

export {};