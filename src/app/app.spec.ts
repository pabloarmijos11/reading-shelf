import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { fakeAuth } from './core/auth.fake';

describe('App', () => {
  async function render(auth = fakeAuth()) {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), auth.provider],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return { fixture, auth, text: () => (fixture.nativeElement as HTMLElement).textContent ?? '' };
  }

  it('should create the app', async () => {
    const { fixture } = await render();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the app title in the header', async () => {
    const { fixture } = await render();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('header a')?.textContent).toContain('reading-shelf');
  });

  it('should offer a sign-in link when nobody is signed in', async () => {
    const { text } = await render();
    expect(text()).toContain('Sign in');
    expect(text()).not.toContain('Sign out');
  });

  it('should show the email and a sign-out button once signed in', async () => {
    const auth = fakeAuth({ user: { uid: 'u1', email: 'pablo@example.com' } });
    const { text } = await render(auth);

    expect(text()).toContain('pablo@example.com');
    expect(text()).toContain('Sign out');
  });

  /**
   * The header stays empty until the session resolves; otherwise a signed-in
   * user sees "Sign in" flash before `onAuthStateChanged` reports back.
   */
  it('should show neither option while the session is still unknown', async () => {
    const auth = fakeAuth({ ready: false });
    const { text } = await render(auth);

    expect(text()).not.toContain('Sign in');
    expect(text()).not.toContain('Sign out');
  });
});
