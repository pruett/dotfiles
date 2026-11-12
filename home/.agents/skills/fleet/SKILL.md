---
name: fleet
description: "Drive the CEO's agent fleet with the `fleet` CLI: start HQ, create, approve or close projects, check status and the queue. Use when the user types /fleet, or asks to start, check or stop the fleet, a project lead, or the CoS."
---

# Fleet

The fleet is the CEO's agents on Herdr. The Chief of Staff (CoS, hc name `cos`) passes messages between the CEO and the leads; one lead per project does the work with its workers. This skill is a remote control for the `fleet` CLI; it does no project work and passes no messages. Read `fleet --help` before your first command: it lists every command, who may run it, and the state layout.

## No arguments

Run `fleet status`, then ask the user what to do with AskUserQuestion, offering what fits that status:

- **Start HQ** (`fleet up`) when the CoS is stopped.
- **New project**: a name (1-27 of `a-z 0-9 -`) and the request in the user's own words.
- **A project's state**: read its `prd.md` (PRD, Now, Stuck) under `$FLEET_HOME/projects/<p>/` (`fleet status` prints the folder).
- **The queue**: `fleet queue`; the user answers items in the Fleet panel's Queue tab in HQ.
- **Close a project**: `fleet project close <p>`.

## With arguments

Map the request to one command and run it.

- **New project**: `fleet project new <name> --brief "<the user's words, verbatim>"`. The brief is the request as said; the lead works out repos, scope and the rest in its PRD. It refuses while the CoS is stopped: offer `fleet up` first.
- **More work for a project**: `fleet project goal <p> "<the user's words>"`.

Report the result in one or two lines. Anything the user wants to tell the CoS or a lead goes through the CoS: point them to HQ.

When a command says the machine is not set up, ask the user for each missing setting, offering the suggestion it prints, and save it with `fleet config <NAME> <value>`.
