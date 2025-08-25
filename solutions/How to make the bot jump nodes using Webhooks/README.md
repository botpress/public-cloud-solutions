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

<img width="633" height="246" alt="image" src="https://github.com/user-attachments/assets/3d0674c6-0f51-4abb-946a-4043fc218600" />

2. Copy the Webhook URL from the "Webhook" Integration settings and put into the "WEBHOOK_URL" variable inside the execute code block at the "Make_Bot_Jump" node.

<img width="2012" height="1026" alt="Webhook Url" src="https://github.com/user-attachments/assets/f23bff37-f84a-4e06-b593-d69b2434d762" />

<img width="368" height="247" alt="Paste Webhook Url" src="https://github.com/user-attachments/assets/4d2bb1db-9cc5-4024-9b5b-990ad3585700" />

<img width="1042" height="267" alt="image" src="https://github.com/user-attachments/assets/92b9cc13-5837-411a-8903-9f91af82110d" />

3. Publish bot and test using Webchat (This solution doesn't work at the emulator)
   
<img width="1082" height="746" alt="Demo" src="https://github.com/user-attachments/assets/4a520937-873d-451b-8d29-86a629a9abcd" />

## How does it work

### Webhook Trigger node with "bind"

<img width="692" height="570" alt="Webhook Trigger" src="https://github.com/user-attachments/assets/b99677be-48e5-485e-a404-fa640059179d" />

### Webhook call inside Execute code block

<img width="1067" height="323" alt="Webhook Call" src="https://github.com/user-attachments/assets/12142622-c4ce-4263-9d67-58b45f82ad8f" />
