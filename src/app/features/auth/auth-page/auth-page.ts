import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth.service';

export type AuthMode = 'login' | 'signup';

@Component({
  selector: 'app-auth-page',
  imports: [RouterLink],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.css',
})
export class AuthPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Comes from the route's `data`, which `withComponentInputBinding()` also binds. */
  readonly mode = input<AuthMode>('login');

  /** Set by the guard when it turns someone away from a protected page. */
  readonly redirectTo = input('/library', {
    transform: (value: string | undefined) => value || '/library',
  });

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly isSignup = computed(() => this.mode() === 'signup');
  protected readonly heading = computed(() => (this.isSignup() ? 'Create account' : 'Sign in'));
  protected readonly submitLabel = computed(() =>
    this.busy() ? 'Working…' : this.isSignup() ? 'Create account' : 'Sign in',
  );

  protected readonly canSubmit = computed(
    () => !this.busy() && this.email().trim().length > 0 && this.password().length > 0,
  );

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSubmit()) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);

    try {
      const email = this.email().trim();
      if (this.isSignup()) {
        await this.auth.signUp(email, this.password());
      } else {
        await this.auth.signIn(email, this.password());
      }
      await this.router.navigateByUrl(this.redirectTo());
    } catch (error) {
      this.error.set(this.auth.describeError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
