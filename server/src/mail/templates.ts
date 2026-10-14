/** Copy comes from docs/design/output/emails.md. No email ever contains a file or folder name. */
export function verifyEmail(link: string): { subject: string; text: string } {
  return {
    subject: 'Verify your email for CrypticStorage',
    text: `Open the link to finish creating your safe. If you did not sign up, ignore this and nothing will happen.\n\n${link}\n`,
  };
}

export function witnessInvitation(ownerName: string, link: string): { subject: string; text: string } {
  return {
    subject: `${ownerName} asked you to be a witness`,
    text: `Together with others they name, you could release their items to the people they chose, and you could never read those items yourself. Open the link to accept or decline.\n\n${link}\n`,
  };
}

export function recipientNotice(ownerName: string, link: string): { subject: string; text: string } {
  return {
    subject: `${ownerName} has set something aside for you`,
    text: `You will receive it on their terms. There is nothing to do now.\n\n${link}\n`,
  };
}

export function ruleRevoked(ownerName: string, link: string): { subject: string; text: string } {
  return {
    subject: 'A handoff rule naming you was withdrawn',
    text: `${ownerName} withdrew a rule that named you. Nothing will be released from it.\n\n${link}\n`,
  };
}
