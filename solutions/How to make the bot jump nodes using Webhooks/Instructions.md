# How to make the bot jump nodes using Webhooks

Original author: @davidvitora

Last updated by @davidvitora on August 25th 2025

## Overview

In this guide, we will learn how to make the bot jump nodes using Webhooks. 
This is useful when you want to redirect the conversation to another node/flow based on certain conditions or external trigger.

There are multiple ways of jumping nodes, this one will use Webhooks to achieve.

## Prerequisites

- A Botpress Cloud bot with the "Webhook" Integration installed

## Steps

This will give you a demo bot where you can test the solution and apply to your own bot later

1. Import the bot from this folder, the bot file name is "jump-to-node-webhooks - (...).bpz"
2. Copy the Webhook URL from the "Webhook" Integration settings and put into the "WEBHOOK_URL" variable inside the execute code block at the "Make_Bot_Jump" node.
3. Publish bot and test using Webchat (This solution doesn't work at the emulator)

## How does it work

### Webhook Trigger node with bind
### Webhook call inside Execute code block
