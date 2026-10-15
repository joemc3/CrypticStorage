# Email templates

Plain text. Subject, two sentences, one link. Placeholders in braces. No email names an item: the server cannot read names, so it cannot put one in an email.

| Template | To | Subject | Body | Link |
|---|---|---|---|---|
| Verify | the new account | Verify your email for CrypticStorage | Open the link to finish creating your safe. If you did not sign up, ignore this and nothing will happen. | `https://{host}/verify/{token}` |
| Reminder 75 % | owner | A handoff rule releases on {date} | You have not signed in since {last activity}, so a rule you made will release to {recipients} on {date}. Sign in, or follow this link, to reset the clock. | `https://{host}/check-in/{token}` |
| Reminder 90 % | owner | A handoff rule releases in {days} days | This is your second reminder; {recipients} receive what the rule covers on {date}. Following this link resets the clock, and nothing else is needed. | `https://{host}/check-in/{token}` |
| Final warning | owner | Final notice: a handoff rule releases on {date} | If you do not sign in or follow this link by then, {recipients} will receive what the rule covers. This is the last email before it happens. | `https://{host}/check-in/{token}` |
| Released by timer | owner | A handoff rule has released | After {period} without a sign-in, a rule you made released to {recipients} on {date}. Your own copies are unchanged. | `https://{host}/dashboard` |
| Released by timer | each recipient | {owner} has handed something to you | It released on {owner}'s terms and is now in Shared with me. Sign in to open it. | `https://{host}/shared` |
| Witness invitation | invited witness | {owner} asked you to be a witness | Together with others they name, you could release their items to the people they chose, and you could never read those items yourself. Open the link to accept or decline. | `https://{host}/witness/{token}` |
| Request opened | owner | A witness asked to release your items | {witness} opened a release request at {time}. Sign in to cancel it; if {k} witnesses vote first, what you marked is released. | `https://{host}/login` |
| Request opened | other witnesses | {witness} asked to release {owner}'s items | You can add your vote or refuse. If {owner} signs in, the request is cancelled. | `https://{host}/dashboard` |
| Vote added | owner | Release request: {count} of {k} votes | {witness} added a vote at {time}. Sign in now to cancel the request. | `https://{host}/login` |
| Release completed | owner | Your witnesses released your items | {k} witnesses voted, and what you marked went to the people you named at {time}. Your own copies are unchanged. | `https://{host}/dashboard` |
| Request cancelled | witnesses | {owner} signed in, so the request is cancelled | Nothing was released. There is nothing for you to do. | `https://{host}/dashboard` |
| Request cancelled (owner write) | witnesses | {owner} changed their safe, so the request is cancelled | Nothing was released. There is nothing for you to do. | `https://{host}/dashboard` |
| Request cancelled (no release possible) | witnesses | The release request for {owner} could not complete | Nothing was released. There is nothing for you to do. | `https://{host}/dashboard` |
| Recipient notice | each recipient | {owner} has set something aside for you | You will receive it on their terms. There is nothing to do now. | `https://{host}/dashboard` |

The quorum recipient notice reuses the "Released by timer" recipient row; the mail does not say which path released the rule.

Two templates are additions to the brief's list: the recipient's copy of "released by timer" and "request cancelled" to witnesses (spec 7.5 says the witnesses are told). Both are flagged in `open-questions.md`.
