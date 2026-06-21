import { test, expect } from '@playwright/test'

// The full-stack reference flow: log in for a bearer token, then exercise the secured
// contact form whose conditional cross-field validation error round-trips onto the
// right field, then a valid submit succeeds.
test('login, cross-field validation error round-trip, then success', async ({ page }) => {
  await page.goto('/')

  // Log in. Any credentials issue a token in this lab.
  await page.getByTestId('login-username').fill('alice')
  await page.getByTestId('login-password').fill('pw')
  await page.getByTestId('login-submit').click()

  // The secured contact form appears once a token is held.
  await expect(page.getByTestId('contact-method')).toBeVisible()

  // method=email but no email: the superRefine cross-field rule fails server-side and the
  // error round-trips onto the email field.
  await page.getByTestId('contact-method').selectOption('email')
  await page.getByTestId('contact-message').fill('hello there')
  await page.getByTestId('contact-submit').click()

  const emailError = page.getByTestId('contact-email-error')
  await expect(emailError).toBeVisible()
  await expect(emailError).toContainText('email')

  // Provide a valid email and resubmit: the request is accepted.
  await page.getByTestId('contact-email').fill('alice@example.com')
  await page.getByTestId('contact-submit').click()
  await expect(page.getByTestId('contact-success')).toBeVisible()
})
