import { NextRequest, NextResponse } from "next/server";

// Common interfaces for all providers
export interface ValidationResult {
  isValid: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

export interface AuthCredentials {
  [key: string]: string | number | boolean;
}

// Error details structure for provider-specific errors
export interface ErrorDetails {
  message?: string;
  status?: string;
  data?: {
    prompt_suggestion?: string;
    [key: string]: unknown;
  };
  prompt?: string[];
  errors?: Record<string, string[]>;
  [key: string]: unknown;
}

export interface ProviderResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  errorDetails?: ErrorDetails;  // Structured error data (prompt suggestions, validation errors, etc.)
  needsPolling?: boolean;
  taskId?: string;
}

export interface BlobResult {
  url: string;
  downloadUrl: string;
  size?: number;
}

export interface StandardizedResponse {
  id?: string;
  url: string;
  audio_url?: string; // For voice providers
  duration?: number;
  provider: string;
  status?: 'completed' | 'processing' | 'failed';
  original_text?: string;
  voice_id?: string;
  style?: string;
  use_case?: string;
  blob_info?: {
    downloadUrl: string;
    size?: number;
  };
  // For async providers
  customer_id?: string;
  access_token?: string;
  message?: string;
}

/**
 * Base class for all audio providers (voice, music, sound effects)
 * Standardizes common functionality while allowing provider-specific customization
 */
export abstract class BaseAudioProvider {
  abstract readonly providerName: string;
  abstract readonly providerType: 'voice' | 'music' | 'sfx';
  
  // Abstract methods that each provider must implement
  abstract validateParams(body: Record<string, unknown>): ValidationResult;
  abstract authenticate(): Promise<AuthCredentials>;
  abstract makeRequest(params: Record<string, unknown>, credentials: AuthCredentials): Promise<ProviderResponse>;
  
  // Optional: for async providers that need polling
  async pollStatus?(taskId: string, credentials: AuthCredentials): Promise<ProviderResponse>;
  
  /**
   * Main entry point - handles the full request lifecycle
   */
  async handleRequest(req: NextRequest): Promise<NextResponse> {
    try {
      // 1. Parse and validate request
      const body = await req.json();
      const validation = this.validateParams(body);
      
      if (!validation.isValid) {
        return this.createErrorResponse(validation.error || "Invalid parameters", 400);
      }

      // Handle internal request to process ready track (skip auth)
      if (validation.data?.isInternalRequest) {
        console.log(`${this.providerName}: Processing ready track for blob upload...`);
        return await this.processSuccessfulResponse({
          id: validation.data._internal_track_id,
          generation_url: validation.data._internal_ready_url,
          prompt: validation.data.prompt,
          duration: validation.data.duration
        });
      }

      // 2. Validate credentials
      if (!this.validateCredentials()) {
        return this.createErrorResponse(`${this.providerName} API credentials are missing`, 500);
      }

      // 3. Authenticate with provider
      let credentials: AuthCredentials;
      try {
        credentials = await this.authenticate();
      } catch (error) {
        console.error(`${this.providerName} authentication failed:`, error);
        return this.createErrorResponse(
          `${this.providerName} authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          500
        );
      }

      // 4. Make the actual provider request
      const response = await this.makeRequest(validation.data || {}, credentials);

      if (!response.success) {
        return NextResponse.json(
          {
            error: response.error || `${this.providerName} request failed`,
            errorDetails: response.errorDetails
          },
          { status: 500 }
        );
      }

      // 5. Handle async providers that need polling
      if (response.needsPolling && response.taskId && this.pollStatus) {
        return NextResponse.json({
          id: response.taskId,
          status: 'processing',
          provider: this.providerName,
          customer_id: credentials.customerId, // Include credentials for client-side polling
          access_token: credentials.accessToken,
          message: `${this.providerName} generation in progress, polling required`
        });
      }

      // 6. Process successful response (upload to blob, format response)
      return await this.processSuccessfulResponse(response.data || {});

    } catch (error) {
      console.error(`Error in ${this.providerName} provider:`, error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : `Unknown error in ${this.providerName} provider`,
        500
      );
    }
  }

  /**
   * Validates environment credentials for the provider
   */
  protected abstract validateCredentials(): boolean;

  /**
   * Processes successful response - handles blob storage and response formatting
   */
  public async processSuccessfulResponse(data: Record<string, unknown>): Promise<NextResponse> {
    // This will be overridden by specific provider implementations
    // as the response processing varies significantly between providers
    return NextResponse.json({
      ...data,
      provider: this.providerName
    });
  }

  /**
   * Creates standardized error responses
   */
  protected createErrorResponse(message: string, status: number): NextResponse {
    console.error(`${this.providerName} error:`, message);
    return NextResponse.json(
      { error: message },
      { status }
    );
  }

  /**
   * Standardized error handling for API responses
   * Returns structured error with both message and detailed data
   */
  protected async handleApiError(response: Response): Promise<{ message: string; details?: ErrorDetails }> {
    let errorMessage = `API error: ${response.status} ${response.statusText}`;
    let errorDetails: ErrorDetails | undefined = undefined;

    try {
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const errorData = await response.json();
        console.error(`${this.providerName} detailed error response:`, JSON.stringify(errorData, null, 2));

        // Extract message from various possible locations
        errorMessage = errorData.message || errorData.error || errorData.detail?.message || errorMessage;

        // Preserve structured details (prompt_suggestion, errors array, etc.)
        errorDetails = errorData.detail || errorData.errors || errorData;
      } else {
        const text = await response.text();
        console.error(`${this.providerName} non-JSON error response:`, text.substring(0, 500));
        errorMessage = text.length > 0 ? text.substring(0, 200) : errorMessage;
      }
    } catch (parseError) {
      console.error(`Error parsing ${this.providerName} error response:`, parseError);
    }

    return { message: errorMessage, details: errorDetails };
  }

  /**
   * Generic fetch wrapper with error handling
   */
  protected async makeFetch(url: string, options: RequestInit): Promise<Response> {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...options.headers
      }
    });

    console.log(`${this.providerName} API response status: ${response.status}`);

    return response;
  }
}