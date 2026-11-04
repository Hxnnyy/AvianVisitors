# Frame Wi-Fi

The frame (Raspberry Pi `avian-frame`, Debian 13 trixie) manages Wi-Fi with NetworkManager. It can remember several networks and joins the highest-priority one in range.

Saved networks (4 Nov 2026):

| Profile | Network | Priority | Use |
| --- | --- | --- | --- |
| `mum-home` | Mum's home Wi-Fi | 10 | Where the frame lives |
| `netplan-wlan0-PLUSNET-P9CTFF` | Joe's Wi-Fi | 0 | Setup and testing |
| `netplan-eth0` | Wired Ethernet | auto | Fallback: plug into the router |

## Add or fix a network

Run from a computer that can reach the Pi: on the same network as it, or over Tailscale. The command asks for the password without showing it, so it never appears on screen or in shell history. Replace `NETWORK-NAME` (exact, case-sensitive) and the profile name.

```bash
ssh -t joe@avian-frame 'read -rsp "Wi-Fi password: " P; echo; sudo nmcli connection delete mum-home 2>/dev/null; sudo nmcli connection add type wifi con-name mum-home ifname wlan0 ssid "NETWORK-NAME" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$P" connection.autoconnect yes connection.autoconnect-priority 10 && unset P && nmcli -t -f NAME,AUTOCONNECT,AUTOCONNECT-PRIORITY connection show'
```

It replaces any existing `mum-home` profile, so you can run it again to correct a typo. The last line lists the saved networks: `mum-home` should show priority 10.

## If it won't connect at Mum's house

1. **Phone hotspot rescue.** Ahead of time, add your phone's hotspot as a profile called `rescue` (the command above with that con-name and the hotspot's name). On the day, turn the hotspot on: the frame joins it and is reachable over Tailscale, so the Wi-Fi can be fixed remotely.
2. **Cable.** Plug the Pi into her router with an Ethernet cable; `netplan-eth0` connects automatically.
3. **Check what it sees** (over the hotspot or cable): `ssh joe@avian-frame 'nmcli device wifi list; journalctl -u NetworkManager -n 50 --no-pager'`.

Until it's back online, the frame keeps showing its last image.
