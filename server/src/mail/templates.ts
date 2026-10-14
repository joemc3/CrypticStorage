/** Copy comes from docs/design/output/emails.md. No email ever contains a file or folder name. */
export function verifyEmail(link: string): { subject: string; text: string } {
  return {
    subject: 'Verify your email for CrypticStorage',
    text: `Open the link to finish creating your safe. If you did not sign up, ignore this and nothing will happen.\n\n${link}\n`,
  };
}
