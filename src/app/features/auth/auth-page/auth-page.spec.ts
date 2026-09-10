import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthPage, AuthMode } from './auth-page';
import { fakeAuth } from '../../../core/auth.fake';

describe('AuthPage', () => {
  async function render(mode: AuthMode = 'login', auth = fakeAuth()) {
    await TestBed.configureTestingModule({
      imports: [AuthPage],
      providers: [provideRouter([]), auth.provider],
    }).compileComponents();

    const fixture = TestBed.createComponent(AuthPage);
    fixture.componentRef.setInput('mode', mode);
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      auth,
      host,
      text: () => host.textContent ?? '',
      submit: async (email: string, password: string) => {
        const emailInput = host.querySelector<HTMLInputElement>('#email')!;
        const passwordInput = host.querySelector<HTMLInputElement>('#password')!;

        emailInput.value = email;
        emailInput.dispatchEvent(new Event('input'));
        passwordInput.value = password;
        passwordInput.dispatchEvent(new Event('input'));
        await fixture.whenStable();

        host.querySelector('form')!.dispatchEvent(new Event('submit'));
        await fixture.whenStable();
      },
    };
  }

  it('should create', async () => {
    const { fixture } = await render();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the sign-in copy by default', async () => {
    const { text } = await render('login');
    expect(text()).toContain('Sign in');
    expect(text()).toContain('No account yet?');
  });

  it('should render the sign-up copy in signup mode', async () => {
    const { text } = await render('signup');
    expect(text()).toContain('Create account');
    expect(text()).toContain('Already have an account?');
  });

  it('should keep submit disabled until both fields are filled', async () => {
    const { host } = await render();
    const button = host.querySelector<HTMLButtonElement>('button[type=submit]');
    expect(button?.disabled).toBe(true);
  });

  it('should sign in with the entered credentials', async () => {
    const { submit, auth } = await render('login');
    await submit('pablo@example.com', 'secret123');

    expect(auth.calls.signIn).toEqual(['pablo@example.com']);
    expect(auth.calls.signUp).toEqual([]);
  });

  it('should create an account in signup mode', async () => {
    const { submit, auth } = await render('signup');
    await submit('pablo@example.com', 'secret123');

    expect(auth.calls.signUp).toEqual(['pablo@example.com']);
    expect(auth.calls.signIn).toEqual([]);
  });

  it('should trim the email before sending it', async () => {
    const { submit, auth } = await render('login');
    await submit('  pablo@example.com  ', 'secret123');

    expect(auth.calls.signIn).toEqual(['pablo@example.com']);
  });

  it('should show a readable message when sign-in fails', async () => {
    const auth = fakeAuth();
    auth.failWith(new Error('boom'));
    const { submit, text } = await render('login', auth);

    await submit('pablo@example.com', 'wrong');

    expect(text()).toContain('Email or password is incorrect.');
  });
});
