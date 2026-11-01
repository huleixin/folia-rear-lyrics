package io.github.huleixin.tingyu.playback;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/DecoderFallbackOfferTest.java
public class DecoderFallbackOfferTest {
    @Test public void networkTimeoutPermissionAndCancellationAreNotDecoderOffers(){for(int code:new int[]{1001,1002,2001,2002,2004,2005,2006})assertFalse(DecoderFallbackOffer.decoderError(code));for(int code:new int[]{3001,4001,4005,5001})assertTrue(DecoderFallbackOffer.decoderError(code));}
    @Test public void aLateClaimCannotDetachTheNextNativeSong(){DecoderFallbackOffer offer=new DecoderFallbackOffer();offer.begin("output","qq:1",7);assertTrue(offer.current("output","qq:1",7,7,false));assertFalse(offer.current("output","qq:2",7,7,false));assertFalse(offer.current("output","qq:1",7,8,false));assertFalse(offer.current("new-output","qq:1",7,7,false));assertFalse(offer.current("output","qq:1",7,7,true));offer.clear();assertFalse(offer.current("output","qq:1",7,7,false));}
}
