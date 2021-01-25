import React, { useRef, useEffect } from "react";
import io from 'socket.io-client';

const Room = (props) => {
  const userVideo = useRef();
  const partnerVideo = useRef();
  const peerRef = useRef();
  const socketRef = useRef();
  const otherUser = useRef();
  const userStream = useRef();
  const senders = useRef([]);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true, video: true}).then(stream => {
      userVideo.current.srcObject = stream;
      userStream.current = stream;

      socketRef.current = io.connect('/');
      // Pull id out and call the join room event for that id in the server
      socketRef.current.emit('join room', props.match.params.roomID);

      // Notify new joined user. There is already a user in the room. Assign otherUser.current as the first joined user in the room
      socketRef.current.on('other user', userID => {
        callUser(userID);
        otherUser.current = userID;
      });

      // Notify the user joined first. New user joined. Assign otherUser.current as the user newly joined to the room
      socketRef.current.on('user joined', userID => {
        otherUser.current = userID;
      });

      // What to do when recieve an offer
      socketRef.current.on('offer', handleRecieveCall);

      // What to do when get an answer
      socketRef.current.on('answer', handleAnswer);

      // Both sides will listen for this event
      socketRef.current.on('ice-candidate', handleNewIceCandidateMsg);
      });
  }, []);

  // What to do when call a user
  const callUser = (userID) => {
    // Create peer object by createPeer method
    peerRef.current = createPeer(userID);
    // Attach each stream track objects(video and audio) to the senders. We do this to be able to send our tracks to the other user
    userStream.current.getTracks().forEach(track => senders.current.push(peerRef.current.addTrack(track, userStream.current)));
  };

  // Define createPeer function with parameter of user id who we are trying to connect(userID is the id of user who is receiving the call)
  const createPeer = (userID) => {
    const peer = new RTCPeerConnection({
      // Check MDN Documentation: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling
      // Using these stun and/or turn servers is to figure out the proper path for peer connections to be able to connect users.
      // Deciding the proper method to send and receive data between users without the actual user of a server.
      iceServers: [                             // Ice Servers
        {
          urls: 'stun:stun.stunprotocol.org'    // One for the stun
        },
        {
          urls: 'turn:numb.viagenie.ca',        // One for the turn
          credential: 'muazkh',
          username: 'webrtc@live.com'
        },
      ],
    });

    // Use this event handler when browser wants to send and ice candidate
    peer.onicecandidate = handleIceCandidateEvent;

    // Use this when user receives a successful remote peer and begin to track video and audio
    peer.ontrack = handleTrackEvent;

    // Use this when needed negotiation like a user wants to call another user
    peer.onnegotiationneeded = () => handleNegotiationNeededEvent(userID);

    return peer;
  };

  // What to do when negotiation needed
  const handleNegotiationNeededEvent = (userID) => {
    // Create an offer
    peerRef.current.createOffer()
    // Then set offer as localDescription
    .then(offer => {
      return peerRef.current.setLocalDescription(offer);
    })
    // Then create payload object with information needed
    .then(() => {
      const payload = {
        // Id of user which we are calling
        target: userID,
        // Id of user which is calling
        caller: socketRef.current.id,
        // Actual offer data
        sdp: peerRef.current.localDescription
      };

      // Call the offer event with payload object which contains information needed
      socketRef.current.emit('offer', payload);
    })
    // Log the error to the console if any
    .catch(e => console.log(e));
  }

  // What to do when recieve a call
  const handleRecieveCall = (incoming) => {
    peerRef.current = createPeer();
    // Define remote offer as description coming from the caller which is in the sdp(localDescription of caller)
    const desc = new RTCSessionDescription(incoming.sdp);
    // Create remote description by using desc
    peerRef.current.setRemoteDescription(desc)
    // Then, attach each stream track objects(video and audio) to the peer object. We do this to be able to send our tracks to the other user
    .then(() => {
      userStream.current.getTracks().forEach(track => peerRef.current.addTrack(track, userStream.current));
    })
    // Then, create an answer
    .then(() => {
      return peerRef.current.createAnswer();
    })
    // Then, set the answer as localDescription
    .then((answer) => {
      return peerRef.current.setLocalDescription(answer);
    })
    // Then create payload object with information needed
    .then(() => {
      const payload = {
        target: incoming.caller,
        caller: socketRef.current.id,
        sdp: peerRef.current.localDescription
      };

      // Call the answer event with payload object which contains information needed
      socketRef.current.emit('answer', payload);
    });
  };

  // What to do, after a user calls another and receives the answer
  const handleAnswer = (answer) => {
    // Define remote offer as description coming from the user who called, which is in the sdp(localDescription of the user who called)
    const desc = new RTCSessionDescription(answer.sdp);
    // Create remote description by using desc
    peerRef.current.setRemoteDescription(desc)
    // Log the error to the console if any
    .catch(e => console.log(e));
  };

  // Used by both users to send each other their candidates
  const handleIceCandidateEvent = (e) => {
    // If there is a candidate
    if (e.candidate) {
      // Create payload object with information needed
      const payload = {
        // Other user in the room
        target: otherUser.current,
        // Users candidate
        candidate: e.candidate
      };

      socketRef.current.emit('ice-candidate', payload);
    }
  };

  const handleNewIceCandidateMsg = (incoming) => {
    const candidate = new RTCIceCandidate(incoming);

    peerRef.current.addIceCandidate(candidate)
    .catch(e => console.log(e));
  };

  const handleTrackEvent = (e) => {
    partnerVideo.current.srcObject = e.streams[0];
  }

  const shareScreen = () => {
    navigator.mediaDevices.getDisplayMedia({ cursor: true }).then((stream) => {
      // Get the screen track of user
      const screenTrack = stream.getTracks()[0];
      // Get the video track and swap it with the screen track
      senders.current.find(sender => sender.track.kind === 'video').replaceTrack(screenTrack);
      // When screen sharing is ended,
      screenTrack.onended = () => {
        // Get the screen track and swap it with the video track
        senders.current.find(sender => sender.track.kind === 'video').replaceTrack(userStream.current.getTracks()[1]);
      }
    });
  };

  return (
    <div>
      <video controls autoPlay muted ref={userVideo} style={{width: 500, height:500}}/>
      <video controls autoPlay ref={partnerVideo} style={{width: 500, height:500}}/>
      <button onClick={shareScreen}>Share screen</button>
    </div>
  );
};

export default Room;
